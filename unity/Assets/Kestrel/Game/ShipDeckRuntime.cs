using System;
using System.Collections.Generic;
using System.Linq;
using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

public sealed class ShipDeckRuntime : MonoBehaviour
{
    private const string SixBayDeckResource = "Kestrel/Prefabs/KestrelSixBayDeck";
    private static readonly IReadOnlyDictionary<string, string> CaptainResources = new Dictionary<string, string>
    {
        [CaptainAppearance.Explorer] = "Kestrel/Characters/CaptainExplorer",
        [CaptainAppearance.FemaleExplorer] = "Kestrel/Characters/CaptainFemaleExplorer",
        [CaptainAppearance.AlienExplorer] = "Kestrel/Characters/CaptainAlienExplorer"
    };
    public const string EditorPreviewName = "Kestrel Ship Preview";
    private readonly List<ModuleBaySocket> sockets = new();
    private GameState state = GameStateFactory.CreateScenario("fresh", 8919);
    private ModuleCatalog moduleCatalog = ModuleCatalog.Empty;
    private KestrelPlayerController? player;
    private GameObject? captainVisual;
    private CaptainPickerUI? captainPicker;
    private LaneEventUI? laneEventUI;
    private KestrelPlayerController? previewPlayer;
    private Quaternion captainRotationBeforePreview;
    private Light? captainPreviewLight;
    private FollowCamera? followCamera;
    private BrowserBridgeBehaviour? bridge;
    private Transform? deckRoot;
    private Interactable? captainConsole;
    private Material? floorMaterial;
    private Material? wallMaterial;
    private Material? cockpitMaterial;
    private Material? engineMaterial;
    private Material? moduleMaterial;

    public GameState State => state;
    public IReadOnlyList<ModuleBaySocket> Sockets => sockets;
    public bool UsingAuthoredDeck { get; private set; }
    public string Objective => CurrentObjective();
    public string CaptainModelId => state.Appearance.Model;
    public Animator? CaptainAnimator => captainVisual?.GetComponentInChildren<Animator>(true);
    public CaptainPickerUI? CaptainPicker => captainPicker;
    public LaneEventUI? LaneEventUI => laneEventUI;
    public IReadOnlyList<string> PlaytestCheckpoints => PlaytestCheckpointStore.Names();

    private void Start()
    {
        moduleCatalog = UnityModuleContent.LoadCatalog();
        BuildScenario("fresh", 8919);
    }

    public void BuildScenario(string scenario, int seed)
    {
        var retainedCaptainModel = CaptainAppearance.Normalize(state.Appearance.Model);
        state = GameStateFactory.CreateScenario(scenario, seed);
        state.Appearance.Model = retainedCaptainModel;
        RebuildDeck();
        PublishState();
    }

    public void SwapModules(int slotA, int slotB)
    {
        if (GameLoop.SwapModules(state, slotA, slotB)) StateChanged();
    }

    public bool AcceptContract(int contractId = 1001)
    {
        var changed = GameLoop.AcceptContract(state, contractId);
        if (changed) StateChanged();
        return changed;
    }

    public bool Depart(string destination)
    {
        var changed = GameLoop.Depart(state, destination);
        if (changed) StateChanged();
        return changed;
    }

    public bool AdvanceTravelDay()
    {
        var changed = GameLoop.AdvanceTravelDay(state);
        if (changed)
        {
            StateChanged();
            laneEventUI?.OpenIfPending();
        }
        return changed;
    }

    public bool ResolveLaneEvent(string choice)
    {
        var changed = GameLoop.ResolveLaneEvent(state, choice);
        if (changed)
        {
            laneEventUI?.CloseIfResolved();
            StateChanged();
        }
        return changed;
    }

    public bool RollLaneEvent()
    {
        var changed = GameLoop.RollLaneEvent(state);
        if (changed)
        {
            StateChanged();
            laneEventUI?.OpenIfPending();
        }
        return changed;
    }

    public void RunLaneEventDemo()
    {
        BuildScenario("fresh", 33);
        AcceptContract();
        Depart("foundry");
        AdvanceTravelDay();
        AdvanceTravelDay();
    }

    public bool WaitDay()
    {
        var changed = GameLoop.WaitDay(state);
        if (changed) StateChanged();
        return changed;
    }

    public bool RunTransferLoop()
    {
        if (state.Offers.Any()) AcceptContract(state.Offers[0].Id);
        if (state.Docked && state.Jobs.Any()) Depart(state.Jobs[0].Destination);
        var guard = 20;
        while (state.Travel != null && guard-- > 0) AdvanceTravelDay();
        return state.Docked && state.Location == "foundry" && state.Jobs.Count == 0 && state.Credits >= 740;
    }

    public void SaveCurrent() => KestrelSaveStore.Save("kestrelrun:unity:slot0", SaveCodec.Serialize(state));

    public bool LoadSaved()
    {
        var json = KestrelSaveStore.Load("kestrelrun:unity:slot0");
        if (string.IsNullOrWhiteSpace(json)) return false;
        state = SaveCodec.Deserialize(json);
        RebuildDeck();
        PublishState();
        return true;
    }

    public bool SavePlaytestCheckpoint(string name)
    {
        if (PlaytestCheckpointStore.NormalizeName(name).Length == 0) return false;
        PlaytestCheckpointStore.Save(name, SaveCodec.Serialize(state));
        PublishState();
        return true;
    }

    public bool LoadPlaytestCheckpoint(string name)
    {
        var json = PlaytestCheckpointStore.Load(name);
        if (string.IsNullOrWhiteSpace(json)) return false;
        state = SaveCodec.Deserialize(json);
        RebuildDeck();
        PublishState();
        return true;
    }

    public bool DeletePlaytestCheckpoint(string name)
    {
        var deleted = PlaytestCheckpointStore.Delete(name);
        if (deleted) PublishState();
        return deleted;
    }

    public string StateJson() => SaveCodec.Serialize(state);
    public string BridgeStateJson()
    {
        var stateJson = StateJson();
        var checkpointJson = string.Join(",", PlaytestCheckpoints.Select(name => $"\"{name}\""));
        return stateJson[..^1] + $",\"playtestCheckpoints\":[{checkpointJson}]}}";
    }
    public string PortSnapshotJson() => PortSnapshotCodec.Serialize(state);

    public void MovePlayerToSlot(int slot)
    {
        var socket = sockets.FirstOrDefault(candidate => candidate.Slot == slot);
        if (socket == null || player == null) return;
        var roomSide = Mathf.Sign(socket.transform.position.x);
        player.Teleport(new Vector3(0f, 0.2f, socket.transform.position.z));
        followCamera?.FrameInspection(
            new Vector3(-roomSide * 1.1f, 2.4f, -2.05f),
            new Vector3(roomSide * 2.15f, 0f, 0.15f));
    }

    public void MovePlayerToCockpit()
    {
        followCamera?.ClearInspection();
        player?.Teleport(new Vector3(0f, 0.2f, -5f));
    }

    public void MovePlayerToMidship()
    {
        followCamera?.ClearInspection();
        player?.Teleport(new Vector3(0f, 0.2f, 7.8f));
    }

    public void MovePlayerToEngine()
    {
        followCamera?.ClearInspection();
        player?.Teleport(new Vector3(0f, 0.2f, 20.7f));
    }

    public void SetCaptainModel(string modelId)
    {
        state.Appearance.Model = CaptainAppearance.Normalize(modelId);
        if (player == null) return;

        ApplyCaptainVisual();
        PublishState();
    }

    public void OpenCaptainPicker() => captainPicker?.Open();

    public void BeginLaneEventPresentation()
    {
        if (captainPicker?.IsOpen == true) captainPicker.Close(false);
        player?.SetInputEnabled(false);
        followCamera?.FrameInspection(new Vector3(0f, 2.1f, -4.4f), new Vector3(0f, 0f, 0.75f));
    }

    public void EndLaneEventPresentation()
    {
        player?.SetInputEnabled(true);
        followCamera?.ClearInspection();
    }

    public void BeginCaptainPreview()
    {
        if (player != null)
        {
            player.SetInputEnabled(false);
            if (previewPlayer != player)
            {
                previewPlayer = player;
                captainRotationBeforePreview = player.transform.rotation;
            }
            player.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
            CreateCaptainPreviewLight(player.transform.position);
        }
        followCamera?.FrameInspection(new Vector3(0f, 1.45f, -3f), Vector3.zero);
    }

    public void EndCaptainPreview()
    {
        player?.SetInputEnabled(true);
        if (previewPlayer != null) previewPlayer.transform.rotation = captainRotationBeforePreview;
        previewPlayer = null;
        if (captainPreviewLight != null) captainPreviewLight.enabled = false;
        followCamera?.ClearInspection();
    }

    private void CreateCaptainPreviewLight(Vector3 playerPosition)
    {
        if (captainPreviewLight == null)
        {
            var lightObject = new GameObject("Captain Preview Key Light");
            lightObject.transform.SetParent(transform, false);
            captainPreviewLight = lightObject.AddComponent<Light>();
            captainPreviewLight.type = LightType.Spot;
            captainPreviewLight.color = new Color(0.72f, 0.9f, 1f);
            captainPreviewLight.intensity = 7f;
            captainPreviewLight.range = 8f;
            captainPreviewLight.spotAngle = 58f;
            captainPreviewLight.shadows = LightShadows.Soft;
        }

        captainPreviewLight.enabled = true;
        captainPreviewLight.transform.position = playerPosition + new Vector3(-0.8f, 2.6f, -2.3f);
        captainPreviewLight.transform.rotation = Quaternion.LookRotation(
            playerPosition + Vector3.up * 1.1f - captainPreviewLight.transform.position);
    }

    private void ApplyCaptainVisual()
    {
        var modelId = CaptainModelId;

        if (captainVisual != null)
        {
            if (Application.isPlaying) Destroy(captainVisual);
            else DestroyImmediate(captainVisual);
        }

        var prefab = Resources.Load<GameObject>(CaptainResources[modelId]);
        if (prefab != null)
        {
            captainVisual = Instantiate(prefab, player.transform, false);
            captainVisual.name = $"Captain Visual ({modelId})";
            player.SetVisualAnimator(captainVisual.GetComponentInChildren<Animator>(true));
            return;
        }

        captainVisual = CaptainMarker("Captain Visual Fallback", Vector3.zero, new Color(0.22f, 0.4f, 0.56f));
        captainVisual.transform.SetParent(player.transform, false);
        player.SetVisualAnimator(null);
        Debug.LogWarning($"Missing native captain prefab for '{modelId}'. Run Kestrel > Characters > Rebuild Captain Prefabs.");
    }

    private void RebuildDeck()
    {
        EnsureMaterials();
        var editorPreview = transform.Find(EditorPreviewName);
        if (editorPreview != null)
        {
            editorPreview.gameObject.SetActive(false);
            if (Application.isPlaying) Destroy(editorPreview.gameObject);
            else DestroyImmediate(editorPreview.gameObject);
        }
        if (deckRoot != null) Destroy(deckRoot.gameObject);
        sockets.Clear();
        deckRoot = new GameObject("Ship Deck").transform;
        deckRoot.SetParent(transform, false);
        CreateLighting();
        CreatePlayerAndCamera();
        CreateBridge();
        CreateCaptainPicker();
        CreateLaneEventUI();
        UsingAuthoredDeck = TryCreateAuthoredDeck();
        if (!UsingAuthoredDeck) CreatePrototypeDeck();
        BindSocketInteractions();
        RefreshSocketLabels();
        UpdateConsolePrompt();
    }

    private bool TryCreateAuthoredDeck()
    {
        if (state.Ship.BayCount != 6) return false;
        var prefab = Resources.Load<GameObject>(SixBayDeckResource);
        if (prefab == null) return false;
        var instance = Instantiate(prefab, deckRoot, false);
        instance.name = "Kestrel Six Bay Deck (Authored)";
        sockets.AddRange(instance.GetComponentsInChildren<ModuleBaySocket>(true).OrderBy(socket => socket.Slot));
        var layout = instance.GetComponent<ShipDeckLayout>();
        if (layout?.CaptainConsoleAnchor != null) BindCaptainConsole(layout.CaptainConsoleAnchor);
        return sockets.Count == state.Ship.BayCount;
    }

    private void CreatePrototypeDeck()
    {
        var count = state.Ship.BayCount;
        var length = count * 4.5f + 4f;
        Cube("Main Corridor", new Vector3(0f, -0.05f, length * 0.5f - 2f), new Vector3(2.8f, 0.1f, length), floorMaterial);
        for (var slot = 0; slot < count; slot++) CreatePrototypeBay(slot, slot * 4.5f);
        Cube("Port Wall", new Vector3(-3.55f, 1.4f, length * 0.5f - 2f), new Vector3(0.2f, 2.8f, length), wallMaterial);
        Cube("Starboard Wall", new Vector3(3.55f, 1.4f, length * 0.5f - 2f), new Vector3(0.2f, 2.8f, length), wallMaterial);
        var console = Cube("Captain Console", new Vector3(0f, 0.45f, -2.2f), new Vector3(1.4f, 0.8f, 0.7f), cockpitMaterial);
        BindCaptainConsole(console.transform);
    }

    private void CreatePrototypeBay(int slot, float z)
    {
        var floor = Cube($"Bay {slot} Floor", new Vector3(0f, 0f, z), new Vector3(6.8f, 0.12f, 3.7f), moduleMaterial);
        Cube($"Bay {slot} Port Bulkhead", new Vector3(-3.35f, 1.2f, z), new Vector3(0.16f, 2.4f, 3.6f), wallMaterial);
        Cube($"Bay {slot} Starboard Bulkhead", new Vector3(3.35f, 1.2f, z), new Vector3(0.16f, 2.4f, 3.6f), wallMaterial);
        var socketObject = new GameObject($"Module Socket {slot}");
        socketObject.transform.SetParent(deckRoot, false);
        socketObject.transform.position = new Vector3(0f, 0.15f, z);
        var anchor = new GameObject("Interaction Anchor").transform;
        anchor.SetParent(socketObject.transform, false);
        var socket = socketObject.AddComponent<ModuleBaySocket>();
        socket.Configure(slot, anchor, floor.GetComponent<Collider>());
        sockets.Add(socket);
    }

    private void BindSocketInteractions()
    {
        foreach (var socket in sockets)
        {
            var anchor = socket.InteractionAnchor ?? socket.transform;
            var interactable = anchor.GetComponent<Interactable>() ?? anchor.gameObject.AddComponent<Interactable>();
            interactable.Range = 2.25f;
            interactable.Prompt = "Inspect module";
        }
    }

    private void BindCaptainConsole(Transform anchor)
    {
        captainConsole = anchor.GetComponent<Interactable>() ?? anchor.gameObject.AddComponent<Interactable>();
        captainConsole.Range = 2.5f;
        captainConsole.OnInteract += NextLoopStep;
    }

    private void NextLoopStep()
    {
        if (state.LaneEvent != null) laneEventUI?.OpenIfPending();
        else if (state.Offers.Any()) AcceptContract(state.Offers[0].Id);
        else if (state.Docked && state.Jobs.Any()) Depart(state.Jobs[0].Destination);
        else if (state.Travel != null) AdvanceTravelDay();
    }

    private void StateChanged()
    {
        RefreshSocketLabels();
        UpdateConsolePrompt();
        PublishState();
    }

    private void UpdateConsolePrompt()
    {
        if (captainConsole != null) captainConsole.Prompt = CurrentObjective();
    }

    private string CurrentObjective()
    {
        if (state.Over) return "End of the line";
        if (state.LaneEvent != null) return "Answer the Tinker Barge hail";
        if (state.Offers.Any()) return $"Accept {state.Offers[0].Title}";
        if (state.Docked && state.Jobs.Any()) return $"Plot course to {state.Jobs[0].Destination}";
        if (state.Travel != null) return $"Advance burn ({state.Travel.Left}d remain)";
        return "Review completed run";
    }

    private void PublishState() => bridge?.PublishState();

    private void RefreshSocketLabels()
    {
        foreach (var socket in sockets)
        {
            var module = state.Ship.Modules.FirstOrDefault(candidate => candidate.Slot == socket.Slot);
            socket.ModuleKey = module?.Key ?? "empty";
            socket.ModuleName = moduleCatalog.Find(socket.ModuleKey)?.Name ?? socket.ModuleKey;
            socket.Powered = module?.Powered ?? false;
        }
    }

    private void EnsureMaterials()
    {
        floorMaterial ??= NewMaterial(new Color(0.16f, 0.17f, 0.18f), "Kestrel Floor");
        wallMaterial ??= NewMaterial(new Color(0.24f, 0.25f, 0.27f), "Kestrel Wall");
        cockpitMaterial ??= NewMaterial(new Color(0.12f, 0.23f, 0.34f), "Kestrel Cockpit");
        engineMaterial ??= NewMaterial(new Color(0.35f, 0.18f, 0.12f), "Kestrel Engine");
        moduleMaterial ??= NewMaterial(new Color(0.22f, 0.31f, 0.25f), "Kestrel Module");
    }

    private void CreateLighting()
    {
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.035f, 0.055f, 0.075f);
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.Linear;
        RenderSettings.fogColor = new Color(0.012f, 0.025f, 0.042f);
        RenderSettings.fogStartDistance = 15f;
        RenderSettings.fogEndDistance = 43f;

        var lightObject = new GameObject("Deck Key Light");
        lightObject.transform.SetParent(deckRoot, false);
        lightObject.transform.SetPositionAndRotation(new Vector3(0f, 7f, 8f), Quaternion.Euler(55f, 180f, 0f));
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.1f;
    }

    private void CreatePlayerAndCamera()
    {
        player = FindFirstObjectByType<KestrelPlayerController>();
        if (player == null)
        {
            var playerObject = new GameObject("Captain");
            playerObject.transform.position = new Vector3(0f, 0.2f, -5f);
            playerObject.AddComponent<CharacterController>();
            player = playerObject.AddComponent<KestrelPlayerController>();
        }
        ApplyCaptainVisual();
        player.Teleport(new Vector3(0f, 0.2f, -5f));
        var camera = Camera.main;
        if (camera == null)
        {
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            camera = cameraObject.AddComponent<Camera>();
            cameraObject.AddComponent<AudioListener>();
        }
        camera.fieldOfView = 62f;
        camera.nearClipPlane = 0.08f;
        camera.farClipPlane = 90f;
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.006f, 0.012f, 0.022f);
        camera.allowHDR = true;
        followCamera = camera.GetComponent<FollowCamera>() ?? camera.gameObject.AddComponent<FollowCamera>();
        followCamera.Target = player.transform;
        followCamera.ClearInspection();
    }

    private void CreateBridge()
    {
        bridge = FindFirstObjectByType<BrowserBridgeBehaviour>();
        if (bridge == null) bridge = new GameObject("KestrelBridge").AddComponent<BrowserBridgeBehaviour>();
        bridge.Runtime = this;
    }

    private void CreateCaptainPicker()
    {
        captainPicker = GetComponent<CaptainPickerUI>() ?? gameObject.AddComponent<CaptainPickerUI>();
        captainPicker.Initialize(this);
    }

    private void CreateLaneEventUI()
    {
        laneEventUI = GetComponent<LaneEventUI>() ?? gameObject.AddComponent<LaneEventUI>();
        laneEventUI.Initialize(this);
    }

    private GameObject Cube(string name, Vector3 position, Vector3 scale, Material? material)
    {
        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.name = name;
        cube.transform.SetParent(deckRoot, false);
        cube.transform.position = position;
        cube.transform.localScale = scale;
        if (material != null) cube.GetComponent<Renderer>().sharedMaterial = material;
        return cube;
    }

    private static GameObject CaptainMarker(string name, Vector3 position, Color color)
    {
        // Cube is already retained by the authored deck. Using the capsule primitive here
        // makes WebGL's managed stripping omit CapsuleCollider, which CreatePrimitive then
        // tries to add at runtime. The marker is visual only; CharacterController owns
        // player collision.
        var marker = new GameObject(name);
        marker.transform.position = position;
        var material = NewMaterial(color, $"{name} Material");
        CaptainPart("Body", marker.transform, new Vector3(0f, 0.72f, 0f), new Vector3(0.52f, 1.15f, 0.42f), material);
        CaptainPart("Head", marker.transform, new Vector3(0f, 1.55f, 0f), new Vector3(0.46f, 0.46f, 0.46f), material);
        return marker;
    }

    private static void CaptainPart(string name, Transform parent, Vector3 localPosition, Vector3 scale, Material material)
    {
        var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
        part.name = name;
        part.transform.SetParent(parent, false);
        part.transform.localPosition = localPosition;
        part.transform.localScale = scale;
        part.GetComponent<Renderer>().sharedMaterial = material;
        var primitiveCollider = part.GetComponent<Collider>();
        if (primitiveCollider == null) return;
        if (Application.isPlaying) Destroy(primitiveCollider);
        else DestroyImmediate(primitiveCollider);
    }

    private static Material NewMaterial(Color color, string name)
    {
        var shader = Shader.Find("Kestrel/Flat") ?? Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Standard");
        return new Material(shader) { name = name, color = color };
    }

    private void OnGUI()
    {
        var travel = state.Travel == null ? state.Location : $"{state.Travel.From} → {state.Travel.Destination} ({state.Travel.Left}d)";
        var upkeep = state.Starve > 0 || state.Unpaid > 0
            ? $"  Starving {state.Starve}d  Payroll missed {state.Unpaid}x"
            : "";
        GUI.Box(new Rect(18f, 18f, 430f, 112f), "");
        GUI.Label(new Rect(32f, 28f, 400f, 24f), $"{state.ShipName} · Day {state.Day} · {travel}");
        GUI.Label(new Rect(32f, 52f, 400f, 24f), $"{state.Credits}cr  Fuel {state.Fuel:0.#}  Food {state.Food}  Hull {state.Hull}/{state.HullMax}{upkeep}");
        GUI.Label(new Rect(32f, 78f, 400f, 40f), state.Over ? "END OF THE LINE" : $"Objective: {CurrentObjective()}");
    }
}
