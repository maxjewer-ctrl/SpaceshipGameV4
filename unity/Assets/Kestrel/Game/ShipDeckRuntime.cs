using System;
using System.Collections.Generic;
using System.Linq;
using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

public sealed class ShipDeckRuntime : MonoBehaviour
{
    private const string SixBayDeckResource = "Kestrel/Prefabs/KestrelSixBayDeck";
    private readonly List<ModuleBaySocket> sockets = new();
    private GameState state = GameStateFactory.CreateScenario("fresh", 8919);
    private ModuleCatalog moduleCatalog = ModuleCatalog.Empty;
    private KestrelPlayerController? player;
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

    private void Start()
    {
        moduleCatalog = UnityModuleContent.LoadCatalog();
        BuildScenario("fresh", 8919);
    }

    public void BuildScenario(string scenario, int seed)
    {
        state = GameStateFactory.CreateScenario(scenario, seed);
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
        if (changed) StateChanged();
        return changed;
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

    public string StateJson() => SaveCodec.Serialize(state);
    public string PortSnapshotJson() => PortSnapshotCodec.Serialize(state);

    public void MovePlayerToSlot(int slot)
    {
        var socket = sockets.FirstOrDefault(candidate => candidate.Slot == slot);
        if (socket == null || player == null) return;
        player.Teleport(socket.transform.position + new Vector3(0f, 0.2f, -1.8f));
    }

    public void MovePlayerToCockpit() => player?.Teleport(new Vector3(0f, 0.2f, -5f));

    public void MovePlayerToMidship() => player?.Teleport(new Vector3(0f, 0.2f, 7.8f));

    public void MovePlayerToEngine() => player?.Teleport(new Vector3(0f, 0.2f, 20.7f));

    private void RebuildDeck()
    {
        EnsureMaterials();
        if (deckRoot != null) Destroy(deckRoot.gameObject);
        sockets.Clear();
        deckRoot = new GameObject("Ship Deck").transform;
        deckRoot.SetParent(transform, false);
        CreateLighting();
        CreatePlayerAndCamera();
        CreateBridge();
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
        if (state.Offers.Any()) AcceptContract(state.Offers[0].Id);
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
            var playerObject = CaptainMarker("Captain", new Vector3(0f, 1f, -4.5f), new Color(0.22f, 0.4f, 0.56f));
            playerObject.AddComponent<CharacterController>();
            player = playerObject.AddComponent<KestrelPlayerController>();
        }
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
        var follow = camera.GetComponent<FollowCamera>() ?? camera.gameObject.AddComponent<FollowCamera>();
        follow.Target = player.transform;
    }

    private void CreateBridge()
    {
        bridge = FindFirstObjectByType<BrowserBridgeBehaviour>();
        if (bridge == null) bridge = new GameObject("KestrelBridge").AddComponent<BrowserBridgeBehaviour>();
        bridge.Runtime = this;
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
