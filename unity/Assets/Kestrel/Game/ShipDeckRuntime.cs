using System;
using System.Collections.Generic;
using System.Linq;
using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

public sealed class ShipDeckRuntime : MonoBehaviour
{
    private readonly List<ModuleBaySocket> sockets = new();
    private GameState state = GameStateFactory.CreateScenario("fresh", 8919);
    private ModuleCatalog moduleCatalog = ModuleCatalog.Empty;
    private KestrelPlayerController? player;
    private BrowserBridgeBehaviour? bridge;
    private Transform? deckRoot;
    private Material? floorMaterial;
    private Material? wallMaterial;
    private Material? cockpitMaterial;
    private Material? engineMaterial;
    private Material? moduleMaterial;

    public GameState State => state;
    public IReadOnlyList<ModuleBaySocket> Sockets => sockets;

    private void Start()
    {
        moduleCatalog = UnityModuleContent.LoadCatalog();
        BuildScenario("fresh", 8919);
    }

    public void BuildScenario(string scenario, int seed)
    {
        state = GameStateFactory.CreateScenario(scenario, seed);
        RebuildDeck();
        bridge?.PublishState();
    }

    public void SwapModules(int slotA, int slotB)
    {
        var a = state.Ship.Modules.FirstOrDefault(m => m.Slot == slotA);
        var b = state.Ship.Modules.FirstOrDefault(m => m.Slot == slotB);
        if (a == null || b == null || a == b)
        {
            return;
        }

        (a.Key, b.Key) = (b.Key, a.Key);
        (a.Powered, b.Powered) = (b.Powered, a.Powered);
        RefreshSocketLabels();
        SaveCurrent();
        bridge?.PublishState();
    }

    public void SaveCurrent()
    {
        var json = SaveCodec.Serialize(state);
        KestrelSaveStore.Save("kestrelrun:unity:slot0", json);
    }

    public bool LoadSaved()
    {
        var json = KestrelSaveStore.Load("kestrelrun:unity:slot0");
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        state = SaveCodec.Deserialize(json);
        RebuildDeck();
        bridge?.PublishState();
        return true;
    }

    public string StateJson()
    {
        return SaveCodec.Serialize(state);
    }

    public void MovePlayerToSlot(int slot)
    {
        var socket = sockets.FirstOrDefault(s => s.Slot == slot);
        if (socket == null || player == null)
        {
            return;
        }

        player.Teleport(socket.transform.position + new Vector3(0f, 0.2f, -1.8f));
    }

    private void RebuildDeck()
    {
        EnsureMaterials();
        if (deckRoot != null)
        {
            Destroy(deckRoot.gameObject);
        }

        sockets.Clear();
        deckRoot = new GameObject("Ship Deck").transform;
        deckRoot.SetParent(transform, false);

        CreateLighting();
        CreatePlayerAndCamera();
        CreateBridge();
        CreateDeckGeometry();
        RefreshSocketLabels();
    }

    private void EnsureMaterials()
    {
        floorMaterial ??= NewMaterial(new Color(0.16f, 0.17f, 0.18f), "Kestrel Floor");
        wallMaterial ??= NewMaterial(new Color(0.24f, 0.25f, 0.27f), "Kestrel Wall");
        cockpitMaterial ??= NewMaterial(new Color(0.12f, 0.23f, 0.34f), "Kestrel Cockpit");
        engineMaterial ??= NewMaterial(new Color(0.35f, 0.18f, 0.12f), "Kestrel Engine");
        moduleMaterial ??= NewMaterial(new Color(0.22f, 0.31f, 0.25f), "Kestrel Module");
    }

    private static Material NewMaterial(Color color, string name)
    {
        var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        var material = new Material(shader) { name = name, color = color };
        return material;
    }

    private void CreateLighting()
    {
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
            var playerObject = Capsule("Captain", new Vector3(0f, 1f, -1.5f), new Color(0.75f, 0.82f, 0.92f));
            playerObject.AddComponent<CharacterController>();
            player = playerObject.AddComponent<KestrelPlayerController>();
        }

        player.Teleport(new Vector3(0f, 0.2f, -1.5f));

        var camera = Camera.main;
        if (camera == null)
        {
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            camera = cameraObject.AddComponent<Camera>();
            cameraObject.AddComponent<AudioListener>();
        }

        var follow = camera.GetComponent<FollowCamera>() ?? camera.gameObject.AddComponent<FollowCamera>();
        follow.Target = player.transform;
    }

    private void CreateBridge()
    {
        bridge = FindFirstObjectByType<BrowserBridgeBehaviour>();
        if (bridge == null)
        {
            var bridgeObject = new GameObject("KestrelBridge");
            bridge = bridgeObject.AddComponent<BrowserBridgeBehaviour>();
        }

        bridge.Runtime = this;
    }

    private void CreateDeckGeometry()
    {
        var count = state.Ship.BayCount;
        var length = count * 4.5f + 4f;
        Cube("Main Corridor", new Vector3(0f, -0.05f, length * 0.5f - 2f), new Vector3(2.8f, 0.1f, length), floorMaterial);

        for (var i = 0; i < count; i++)
        {
            var z = i * 4.5f;
            var roomMaterial = i == 0 ? cockpitMaterial : i == count - 1 ? engineMaterial : moduleMaterial;
            CreateBay(i, z, roomMaterial);
        }

        Cube("Port Wall", new Vector3(-3.55f, 1.4f, length * 0.5f - 2f), new Vector3(0.2f, 2.8f, length), wallMaterial);
        Cube("Starboard Wall", new Vector3(3.55f, 1.4f, length * 0.5f - 2f), new Vector3(0.2f, 2.8f, length), wallMaterial);
    }

    private void CreateBay(int slot, float z, Material? roomMaterial)
    {
        Cube($"Bay {slot} Floor", new Vector3(0f, 0f, z), new Vector3(6.8f, 0.12f, 3.7f), roomMaterial);
        Cube($"Bay {slot} Port Bulkhead", new Vector3(-3.35f, 1.2f, z), new Vector3(0.16f, 2.4f, 3.6f), wallMaterial);
        Cube($"Bay {slot} Starboard Bulkhead", new Vector3(3.35f, 1.2f, z), new Vector3(0.16f, 2.4f, 3.6f), wallMaterial);
        Cube($"Bay {slot} Aft Line", new Vector3(0f, 0.08f, z + 1.85f), new Vector3(6.8f, 0.16f, 0.1f), wallMaterial);

        var socketObject = new GameObject($"Module Socket {slot}");
        socketObject.transform.SetParent(deckRoot, false);
        socketObject.transform.position = new Vector3(0f, 0.15f, z);
        var socket = socketObject.AddComponent<ModuleBaySocket>();
        socket.Slot = slot;
        sockets.Add(socket);

        var interactable = socketObject.AddComponent<Interactable>();
        interactable.Range = 2.25f;
        interactable.Prompt = slot == 0 ? "Captain console" : "Inspect module";
        interactable.OnInteract += () =>
        {
            if (slot == 0)
            {
                SwapModules(1, Math.Min(2, state.Ship.BayCount - 2));
            }
        };

        if (slot == 0)
        {
            var console = Cube("Captain Console", new Vector3(0f, 0.45f, z + 0.8f), new Vector3(1.4f, 0.8f, 0.7f), cockpitMaterial);
            console.transform.SetParent(socketObject.transform, true);
        }
    }

    private void RefreshSocketLabels()
    {
        foreach (var socket in sockets)
        {
            var module = state.Ship.Modules.FirstOrDefault(m => m.Slot == socket.Slot);
            socket.ModuleKey = module?.Key ?? "empty";
            socket.ModuleName = moduleCatalog.Find(socket.ModuleKey)?.Name ?? socket.ModuleKey;
            socket.Powered = module?.Powered ?? false;
        }
    }

    private GameObject Cube(string name, Vector3 position, Vector3 scale, Material? material)
    {
        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.name = name;
        cube.transform.SetParent(deckRoot, false);
        cube.transform.position = position;
        cube.transform.localScale = scale;
        if (material != null)
        {
            cube.GetComponent<Renderer>().sharedMaterial = material;
        }

        return cube;
    }

    private static GameObject Capsule(string name, Vector3 position, Color color)
    {
        var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        capsule.name = name;
        capsule.transform.position = position;
        capsule.GetComponent<Renderer>().sharedMaterial = NewMaterial(color, $"{name} Material");
        return capsule;
    }
}
