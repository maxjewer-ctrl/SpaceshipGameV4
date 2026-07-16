using System;
using System.IO;
using Kestrel.Game;
using UnityEditor;
using UnityEngine;

namespace Kestrel.Editor;

public static class KestrelShipPrefabBuilder
{
    public const string SixBayPrefabPath = "Assets/Resources/Kestrel/Prefabs/KestrelSixBayDeck.prefab";
    public const int SixBayVisualRevision = 6;
    private const string MaterialRoot = "Assets/Kestrel/Content/Materials";
    private const string FlatShaderName = "Kestrel/Flat";

    public static void EnsurePrefabs()
    {
        Directory.CreateDirectory(MaterialRoot);
        UpdateExistingMaterials();
        var existing = AssetDatabase.LoadAssetAtPath<GameObject>(SixBayPrefabPath);
        var layout = existing != null ? existing.GetComponent<ShipDeckLayout>() : null;
        if (layout == null || layout.VisualRevision != SixBayVisualRevision)
        {
            BuildSixBayPrefab();
        }
    }

    [MenuItem("Kestrel/Level/Rebuild Six Bay Ship Prefab")]
    public static void RebuildSixBayPrefab() => BuildSixBayPrefab();

    private static void BuildSixBayPrefab()
    {
        ImportRuntimeScript("Assets/Kestrel/Game/ModuleBaySocket.cs", typeof(ModuleBaySocket));
        ImportRuntimeScript("Assets/Kestrel/Game/ShipBayRoom.cs", typeof(ShipBayRoom));
        ImportRuntimeScript("Assets/Kestrel/Game/ShipDeckLayout.cs", typeof(ShipDeckLayout));
        Directory.CreateDirectory(Path.GetDirectoryName(SixBayPrefabPath)!);
        Directory.CreateDirectory(MaterialRoot);

        var floor = Material("DeckFloor", new Color(0.055f, 0.075f, 0.09f), pattern: 1f, panelScale: 0.82f, wear: 0.22f);
        var wall = Material("DeckBulkhead", new Color(0.135f, 0.17f, 0.2f), pattern: 1f, panelScale: 0.68f, wear: 0.16f);
        var ceiling = Material("DeckCeiling", new Color(0.04f, 0.055f, 0.07f), pattern: 1f, panelScale: 0.72f, wear: 0.12f);
        var trim = Material("DeckTrim", new Color(0.46f, 0.17f, 0.028f), 0.08f, pattern: 2f, panelScale: 1.4f, wear: 0.22f);
        var cockpit = Material("CockpitBlue", new Color(0.055f, 0.14f, 0.23f));
        var engine = Material("EngineRed", new Color(0.3f, 0.065f, 0.035f));
        var module = Material("ModuleGreen", new Color(0.07f, 0.2f, 0.16f));
        var console = Material("ConsoleDark", new Color(0.055f, 0.075f, 0.09f));
        var screen = Material("ScreenCyan", new Color(0.025f, 0.22f, 0.27f), 1f, emission: 0.92f, emissionColor: new Color(0.06f, 0.72f, 0.92f));
        var warning = Material("WarningAmber", new Color(0.38f, 0.16f, 0.025f), 1f, emission: 1.05f, emissionColor: new Color(1f, 0.34f, 0.045f));
        var engineGlow = Material("EngineGlow", new Color(0.36f, 0.025f, 0.012f), 1f, emission: 1.35f, emissionColor: new Color(1f, 0.11f, 0.025f));
        var cargo = Material("CargoTan", new Color(0.37f, 0.25f, 0.13f));
        var berth = Material("BerthBlue", new Color(0.12f, 0.25f, 0.38f));

        var root = new GameObject("Kestrel Six Bay Deck");
        try
        {
            BuildHullShell(root.transform, wall, ceiling, screen, trim);
            var consoleAnchor = BuildCockpit(root.transform, floor, wall, cockpit, console, screen, warning, trim);
            BuildCentralCorridor(root.transform, floor, wall, screen, trim);

            var bayCenters = new[] { 0.5f, 7f, 13.5f };
            for (var pair = 0; pair < bayCenters.Length; pair++)
            {
                BuildBay(root.transform, pair * 2, -1, bayCenters[pair], floor, wall, module, trim, warning, screen, cargo, berth);
                BuildBay(root.transform, pair * 2 + 1, 1, bayCenters[pair], floor, wall, module, trim, warning, screen, cargo, berth);
            }

            BuildEngineRoom(root.transform, floor, wall, engine, console, screen, warning, engineGlow, trim);

            var layout = AddScript<ShipDeckLayout>(root, "Assets/Kestrel/Game/ShipDeckLayout.cs");
            layout.Configure("kestrel-6", 6, SixBayVisualRevision, consoleAnchor);
            PrefabUtility.SaveAsPrefabAsset(root, SixBayPrefabPath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(root);
        }
    }

    private static void BuildHullShell(Transform root, Material wall, Material ceiling, Material screen, Material trim)
    {
        var inset = Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        var conduit = Material("ConduitSteel", new Color(0.22f, 0.27f, 0.3f), pattern: 2f, panelScale: 2.2f, wear: 0.2f);
        var lightPool = Material("LightPoolCyan", new Color(0.015f, 0.08f, 0.1f), 1f, emission: 0.18f, emissionColor: new Color(0.02f, 0.2f, 0.28f));
        Primitive("Port Outer Hull", root, new Vector3(-3.9f, 1.55f, 7.75f), new Vector3(0.22f, 3.1f, 33f), wall);
        Primitive("Starboard Outer Hull", root, new Vector3(3.9f, 1.55f, 7.75f), new Vector3(0.22f, 3.1f, 33f), wall);
        Primitive("Armored Ceiling", root, new Vector3(0f, 3.18f, 7.75f), new Vector3(7.8f, 0.22f, 33f), ceiling);

        for (var index = 0; index < 7; index++)
        {
            var z = -6.35f + index * 4.7f;
            Decoration($"Port Hull Recess {index}", root, new Vector3(-3.76f, 1.42f, z), new Vector3(0.05f, 1.95f, 3.4f), inset);
            Decoration($"Starboard Hull Recess {index}", root, new Vector3(3.76f, 1.42f, z), new Vector3(0.05f, 1.95f, 3.4f), inset);
            Decoration($"Ceiling Service Panel {index}", root, new Vector3(0f, 3.04f, z), new Vector3(2.75f, 0.06f, 3.3f), inset);
        }

        var ribs = new[] { -2.1f, 3.85f, 10.35f, 16.85f, 19.1f };
        foreach (var z in ribs)
        {
            Primitive($"Hull Rib {z:0.0}", root, new Vector3(0f, 3.01f, z), new Vector3(7.55f, 0.12f, 0.24f), trim);
            Primitive($"Port Rib {z:0.0}", root, new Vector3(-3.58f, 1.55f, z), new Vector3(0.28f, 2.8f, 0.3f), trim);
            Primitive($"Starboard Rib {z:0.0}", root, new Vector3(3.58f, 1.55f, z), new Vector3(0.28f, 2.8f, 0.3f), trim);
        }

        for (var index = 0; index < 6; index++)
        {
            var z = -4.5f + index * 5.1f;
            Primitive($"Port Ceiling Light {index}", root, new Vector3(-0.72f, 3.04f, z), new Vector3(0.12f, 0.06f, 2.2f), screen);
            Primitive($"Starboard Ceiling Light {index}", root, new Vector3(0.72f, 3.04f, z), new Vector3(0.12f, 0.06f, 2.2f), screen);
            Decoration($"Light Pool {index}", root, new Vector3(0f, 0.075f, z), new Vector3(1.95f, 0.018f, 2.7f), lightPool);
        }

        foreach (var x in new[] { -3.43f, 3.43f })
        {
            Decoration($"{(x < 0f ? "Port" : "Starboard")} Main Conduit", root, new Vector3(x, 2.56f, 7.75f), new Vector3(0.11f, 16.4f, 0.11f), conduit, new Vector3(90f, 0f, 0f), PrimitiveType.Cylinder);
            Decoration($"{(x < 0f ? "Port" : "Starboard")} Secondary Conduit", root, new Vector3(x - Math.Sign(x) * 0.28f, 2.38f, 7.75f), new Vector3(0.065f, 16.4f, 0.065f), trim, new Vector3(90f, 0f, 0f), PrimitiveType.Cylinder);
        }
    }

    private static Transform BuildCockpit(
        Transform root,
        Material floor,
        Material wall,
        Material cockpit,
        Material console,
        Material screen,
        Material warning,
        Material trim)
    {
        var inset = Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        var space = Material("SpaceBlack", new Color(0.004f, 0.008f, 0.018f), 1f);
        var stars = Material("Starlight", new Color(0.35f, 0.55f, 0.72f), 1f, emission: 1.45f, emissionColor: new Color(0.65f, 0.84f, 1f));
        var planet = Material("PlanetBlue", new Color(0.025f, 0.12f, 0.2f), 1f, emission: 0.3f, emissionColor: new Color(0.08f, 0.25f, 0.38f));
        Primitive("Cockpit Deck", root, new Vector3(0f, 0f, -5.45f), new Vector3(7.45f, 0.16f, 6.55f), cockpit);
        for (var index = 0; index < 3; index++)
        {
            Decoration($"Cockpit Floor Plate {index}", root, new Vector3(0f, 0.09f, -7.15f + index * 1.7f), new Vector3(2.2f, 0.025f, 1.35f), inset);
        }
        Primitive("Cockpit Aft Bulkhead", root, new Vector3(0f, 1.55f, -8.7f), new Vector3(7.55f, 3.1f, 0.2f), wall);
        Primitive("Forward Viewport", root, new Vector3(0f, 1.82f, -8.56f), new Vector3(4.5f, 1.25f, 0.08f), space);
        Primitive("Viewport Port Brace", root, new Vector3(-2.45f, 1.75f, -8.45f), new Vector3(0.3f, 1.75f, 0.3f), trim, new Vector3(0f, 0f, -13f));
        Primitive("Viewport Starboard Brace", root, new Vector3(2.45f, 1.75f, -8.45f), new Vector3(0.3f, 1.75f, 0.3f), trim, new Vector3(0f, 0f, 13f));

        BuildObservationWindow(root, -1, -5.5f, space, stars, planet, trim);
        BuildObservationWindow(root, 1, -5.5f, space, stars, planet, trim);

        Primitive("Port Command Bank", root, new Vector3(-2.75f, 0.62f, -5.2f), new Vector3(1.15f, 0.95f, 4.25f), console, new Vector3(0f, -5f, 0f));
        Primitive("Starboard Command Bank", root, new Vector3(2.75f, 0.62f, -5.2f), new Vector3(1.15f, 0.95f, 4.25f), console, new Vector3(0f, 5f, 0f));
        for (var index = 0; index < 3; index++)
        {
            var z = -6.55f + index * 1.35f;
            Primitive($"Port Console Screen {index}", root, new Vector3(-2.72f, 1.12f, z), new Vector3(0.72f, 0.06f, 0.72f), index == 1 ? warning : screen);
            Primitive($"Starboard Console Screen {index}", root, new Vector3(2.72f, 1.12f, z), new Vector3(0.72f, 0.06f, 0.72f), index == 1 ? warning : screen);
        }

        var consoleAnchor = new GameObject("Captain Console Anchor").transform;
        consoleAnchor.SetParent(root, false);
        consoleAnchor.localPosition = new Vector3(0f, 0f, -2.85f);
        Primitive("Helm Pedestal", consoleAnchor, new Vector3(0f, 0.58f, 0f), new Vector3(1.75f, 1.05f, 0.78f), console);
        Primitive("Helm Display", consoleAnchor, new Vector3(0f, 1.18f, -0.08f), new Vector3(1.35f, 0.72f, 0.09f), screen, new Vector3(18f, 0f, 0f));
        Primitive("Helm Warning Strip", consoleAnchor, new Vector3(0f, 0.2f, -0.48f), new Vector3(1.9f, 0.08f, 0.12f), warning);
        Decoration("Helm Footwell", root, new Vector3(0f, 0.105f, -3.25f), new Vector3(2.4f, 0.035f, 2.05f), inset);
        Primitive("Helm Port Rail", root, new Vector3(-1.15f, 0.42f, -3.35f), new Vector3(0.12f, 0.75f, 1.7f), trim);
        Primitive("Helm Starboard Rail", root, new Vector3(1.15f, 0.42f, -3.35f), new Vector3(0.12f, 0.75f, 1.7f), trim);
        return consoleAnchor;
    }

    private static void BuildObservationWindow(
        Transform root,
        int side,
        float z,
        Material space,
        Material stars,
        Material planet,
        Material trim)
    {
        var sideName = side < 0 ? "Port" : "Starboard";
        var x = side * 3.76f;
        Decoration($"{sideName} Observation Glass", root, new Vector3(x, 1.66f, z), new Vector3(0.055f, 1.32f, 3.6f), space);
        Decoration($"{sideName} Viewport Lower Frame", root, new Vector3(x - side * 0.05f, 0.94f, z), new Vector3(0.16f, 0.16f, 3.9f), trim);
        Decoration($"{sideName} Viewport Upper Frame", root, new Vector3(x - side * 0.05f, 2.38f, z), new Vector3(0.16f, 0.16f, 3.9f), trim);
        foreach (var offset in new[] { -1.82f, 0f, 1.82f })
        {
            Decoration($"{sideName} Viewport Mullion {offset:0.0}", root, new Vector3(x - side * 0.06f, 1.66f, z + offset), new Vector3(0.15f, 1.6f, 0.12f), trim);
        }

        var starPositions = new[]
        {
            new Vector2(1.98f, -1.28f), new Vector2(1.43f, 0.92f), new Vector2(1.12f, -0.25f),
            new Vector2(1.77f, 1.31f), new Vector2(1.26f, -0.88f), new Vector2(2.08f, 0.38f)
        };
        for (var index = 0; index < starPositions.Length; index++)
        {
            var point = starPositions[index];
            Decoration($"{sideName} Star {index}", root, new Vector3(x - side * 0.1f, point.x, z + point.y), new Vector3(0.035f, 0.045f + (index % 2) * 0.025f, 0.055f), stars);
        }

        if (side < 0)
        {
            Decoration("Port Planet Limb", root, new Vector3(x + 0.1f, 1.36f, z + 0.95f), new Vector3(0.42f, 0.68f, 0.42f), planet, new Vector3(0f, 0f, 90f), PrimitiveType.Cylinder);
        }
    }

    private static void BuildCentralCorridor(Transform root, Material floor, Material wall, Material screen, Material trim)
    {
        var inset = Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        Primitive("Central Corridor", root, new Vector3(0f, -0.01f, 8.3f), new Vector3(2.45f, 0.14f, 21.1f), floor);
        Primitive("Port Corridor Rail", root, new Vector3(-1.12f, 0.1f, 8.3f), new Vector3(0.1f, 0.08f, 21f), trim);
        Primitive("Starboard Corridor Rail", root, new Vector3(1.12f, 0.1f, 8.3f), new Vector3(0.1f, 0.08f, 21f), trim);

        for (var index = 0; index < 12; index++)
        {
            var z = -1.1f + index * 1.72f;
            Decoration($"Corridor Tread {index:00}", root, new Vector3(0f, 0.075f, z), new Vector3(1.82f, 0.025f, 1.28f), inset);
            if (index % 3 == 1)
            {
                Decoration($"Corridor Guide {index:00}", root, new Vector3(0f, 0.105f, z), new Vector3(0.72f, 0.018f, 0.055f), screen);
            }
        }

        var junctions = new[] { -1.85f, 4.2f, 10.7f, 17.2f };
        foreach (var z in junctions)
        {
            Primitive($"Port Corridor Buttress {z:0.0}", root, new Vector3(-1.28f, 1.25f, z), new Vector3(0.18f, 2.5f, 0.3f), wall);
            Primitive($"Starboard Corridor Buttress {z:0.0}", root, new Vector3(1.28f, 1.25f, z), new Vector3(0.18f, 2.5f, 0.3f), wall);
            Primitive($"Junction Lamp {z:0.0}", root, new Vector3(0f, 2.72f, z), new Vector3(1.6f, 0.12f, 0.12f), screen);
        }
    }

    private static void BuildBay(
        Transform root,
        int slot,
        int side,
        float z,
        Material floor,
        Material wall,
        Material module,
        Material trim,
        Material warning,
        Material screen,
        Material cargo,
        Material berth)
    {
        var sideName = side < 0 ? "Port" : "Starboard";
        var roomObject = new GameObject($"Bay {slot:00} {sideName}");
        roomObject.transform.SetParent(root, false);
        roomObject.transform.localPosition = new Vector3(side * 2.58f, 0f, z);
        var room = AddScript<ShipBayRoom>(roomObject, "Assets/Kestrel/Game/ShipBayRoom.cs");

        var floorObject = Primitive("Room Deck", roomObject.transform, Vector3.zero, new Vector3(2.55f, 0.14f, 4.55f), module);
        Primitive("Forward Divider", roomObject.transform, new Vector3(0f, 1.55f, -2.25f), new Vector3(2.6f, 3.1f, 0.16f), wall);
        Primitive("Aft Divider", roomObject.transform, new Vector3(0f, 1.55f, 2.25f), new Vector3(2.6f, 3.1f, 0.16f), wall);
        var inset = Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        Decoration("Room Floor Inset", roomObject.transform, new Vector3(0f, 0.08f, 0f), new Vector3(2.08f, 0.025f, 3.88f), inset);
        Decoration("Forward Bulkhead Inset", roomObject.transform, new Vector3(0f, 1.48f, -2.15f), new Vector3(1.92f, 2.15f, 0.035f), inset);
        Decoration("Aft Bulkhead Inset", roomObject.transform, new Vector3(0f, 1.48f, 2.15f), new Vector3(1.92f, 2.15f, 0.035f), inset);

        var innerX = -side * 1.23f;
        Primitive("Door Forward Post", roomObject.transform, new Vector3(innerX, 1.25f, -1.62f), new Vector3(0.18f, 2.5f, 0.22f), trim);
        Primitive("Door Aft Post", roomObject.transform, new Vector3(innerX, 1.25f, 1.62f), new Vector3(0.18f, 2.5f, 0.22f), trim);
        Primitive("Door Header", roomObject.transform, new Vector3(innerX, 2.48f, 0f), new Vector3(0.18f, 0.22f, 3.45f), trim);
        Primitive("Bay Number Lamp", roomObject.transform, new Vector3(innerX - side * 0.02f, 2.16f, 0f), new Vector3(0.08f, 0.28f, 0.75f), slot % 2 == 0 ? screen : warning);

        BuildModuleProp(slot, side, roomObject.transform, wall, trim, warning, screen, cargo, berth);

        var socketObject = new GameObject($"Module Socket {slot}");
        socketObject.transform.SetParent(roomObject.transform, false);
        socketObject.transform.localPosition = new Vector3(0f, 0.15f, 0f);
        var anchor = new GameObject("Interaction Anchor").transform;
        anchor.SetParent(socketObject.transform, false);
        anchor.localPosition = new Vector3(-side * 0.65f, 0.8f, 0f);
        var socket = AddScript<ModuleBaySocket>(socketObject, "Assets/Kestrel/Game/ModuleBaySocket.cs");
        var floorCollider = floorObject.GetComponent<Collider>();
        socket.Configure(slot, anchor, floorCollider);
        room.Configure(socket, floorCollider);
    }

    private static void BuildModuleProp(
        int slot,
        int side,
        Transform room,
        Material wall,
        Material trim,
        Material warning,
        Material screen,
        Material cargo,
        Material berth)
    {
        var outerX = side * 0.62f;
        switch (slot)
        {
            case 0:
                Primitive("Fuel Tank A", room, new Vector3(outerX, 0.86f, -0.72f), new Vector3(0.48f, 0.82f, 0.48f), cargo, Vector3.zero, PrimitiveType.Cylinder);
                Primitive("Fuel Tank B", room, new Vector3(outerX, 0.86f, 0.72f), new Vector3(0.48f, 0.82f, 0.48f), cargo, Vector3.zero, PrimitiveType.Cylinder);
                Primitive("Fuel Manifold", room, new Vector3(outerX, 1.68f, 0f), new Vector3(0.18f, 0.16f, 1.75f), warning);
                break;
            case 1:
                Primitive("Cargo Crate A", room, new Vector3(outerX, 0.48f, -0.85f), new Vector3(1.05f, 0.9f, 1.2f), cargo);
                Primitive("Cargo Crate B", room, new Vector3(outerX, 0.48f, 0.55f), new Vector3(1.05f, 0.9f, 1.2f), cargo);
                Primitive("Cargo Crate Top", room, new Vector3(outerX, 1.28f, 0.15f), new Vector3(0.9f, 0.65f, 1.15f), cargo);
                break;
            case 2:
            case 3:
                Primitive("Lower Berth", room, new Vector3(outerX, 0.42f, 0f), new Vector3(1.05f, 0.22f, 2.8f), berth);
                Primitive("Upper Berth", room, new Vector3(outerX, 1.48f, 0f), new Vector3(1.05f, 0.22f, 2.8f), berth);
                Primitive("Berth Spine", room, new Vector3(outerX + side * 0.48f, 0.95f, 0f), new Vector3(0.12f, 1.9f, 2.9f), wall);
                Primitive("Reading Light", room, new Vector3(outerX - side * 0.46f, 1.82f, -0.85f), new Vector3(0.08f, 0.12f, 0.42f), screen);
                break;
            case 4:
                Primitive("Workshop Bench", room, new Vector3(outerX, 0.72f, 0f), new Vector3(1.05f, 0.18f, 2.9f), cargo);
                Primitive("Tool Wall", room, new Vector3(outerX + side * 0.47f, 1.45f, 0f), new Vector3(0.12f, 1.45f, 2.9f), wall);
                Primitive("Diagnostic Screen", room, new Vector3(outerX - side * 0.05f, 1.48f, -0.55f), new Vector3(0.12f, 0.62f, 0.78f), screen);
                Primitive("Bench Vice", room, new Vector3(outerX - side * 0.4f, 1.02f, 0.75f), new Vector3(0.3f, 0.35f, 0.35f), trim);
                break;
            default:
                Primitive("Spare Rack", room, new Vector3(outerX, 1.2f, 0f), new Vector3(1.0f, 2.25f, 2.8f), wall);
                for (var index = 0; index < 3; index++)
                {
                    Primitive($"Rack Status {index}", room, new Vector3(outerX - side * 0.52f, 0.62f + index * 0.58f, 0f), new Vector3(0.08f, 0.16f, 1.85f), index == 2 ? warning : screen);
                }
                break;
        }
    }

    private static void BuildEngineRoom(
        Transform root,
        Material floor,
        Material wall,
        Material engine,
        Material console,
        Material screen,
        Material warning,
        Material engineGlow,
        Material trim)
    {
        const float engineZ = 21.55f;
        var inset = Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        var conduit = Material("ConduitSteel", new Color(0.22f, 0.27f, 0.3f), pattern: 2f, panelScale: 2.2f, wear: 0.2f);
        Primitive("Engine Room Deck", root, new Vector3(0f, 0f, engineZ), new Vector3(7.5f, 0.16f, 5.55f), engine);
        Decoration("Engine Service Grate", root, new Vector3(0f, 0.095f, 20.75f), new Vector3(2.05f, 0.035f, 3.55f), inset);
        for (var index = 0; index < 7; index++)
        {
            Decoration($"Engine Grate Slat {index}", root, new Vector3(0f, 0.13f, 19.35f + index * 0.47f), new Vector3(1.85f, 0.025f, 0.08f), conduit);
        }
        Primitive("Engine Aft Bulkhead", root, new Vector3(0f, 1.55f, 24.25f), new Vector3(7.55f, 3.1f, 0.2f), wall);
        Primitive("Core Glow", root, new Vector3(0f, 1.35f, 22.1f), new Vector3(0.78f, 1.32f, 0.78f), engineGlow, Vector3.zero, PrimitiveType.Cylinder);
        foreach (var x in new[] { -0.92f, 0.92f })
        {
            foreach (var z in new[] { 21.18f, 23.02f })
            {
                Primitive($"Core Frame {x:0.00} {z:0.00}", root, new Vector3(x, 1.4f, z), new Vector3(0.18f, 2.55f, 0.18f), engine);
            }
        }
        Primitive("Core Lower Collar", root, new Vector3(0f, 0.26f, 22.1f), new Vector3(2.55f, 0.22f, 2.55f), trim);
        Primitive("Core Upper Collar", root, new Vector3(0f, 2.72f, 22.1f), new Vector3(1.8f, 0.12f, 1.8f), trim);

        foreach (var side in new[] { -1, 1 })
        {
            Primitive(side < 0 ? "Port Coolant Pipe" : "Starboard Coolant Pipe", root, new Vector3(side * 2.85f, 1.3f, 22.25f), new Vector3(0.25f, 1.3f, 0.25f), conduit, Vector3.zero, PrimitiveType.Cylinder);
            Decoration(side < 0 ? "Port Coolant Warning Band" : "Starboard Coolant Warning Band", root, new Vector3(side * 2.85f, 1.45f, 22.25f), new Vector3(0.27f, 0.12f, 0.27f), warning, Vector3.zero, PrimitiveType.Cylinder);
            Decoration(side < 0 ? "Port Coolant Feed" : "Starboard Coolant Feed", root, new Vector3(side * 2.85f, 2.55f, 21.6f), new Vector3(0.13f, 1.3f, 0.13f), conduit, new Vector3(90f, 0f, 0f), PrimitiveType.Cylinder);
            Primitive(side < 0 ? "Port Engine Console" : "Starboard Engine Console", root, new Vector3(side * 2.6f, 0.65f, 20.55f), new Vector3(1.25f, 1.05f, 1.25f), console);
            Primitive(side < 0 ? "Port Engine Display" : "Starboard Engine Display", root, new Vector3(side * 2.6f, 1.28f, 20.38f), new Vector3(0.82f, 0.58f, 0.08f), screen, new Vector3(15f, 0f, 0f));
        }
    }

    private static GameObject Decoration(
        string name,
        Transform parent,
        Vector3 localPosition,
        Vector3 scale,
        Material material,
        Vector3? localEuler = null,
        PrimitiveType primitiveType = PrimitiveType.Cube)
    {
        var decoration = Primitive(name, parent, localPosition, scale, material, localEuler, primitiveType);
        var collider = decoration.GetComponent<Collider>();
        if (collider != null) UnityEngine.Object.DestroyImmediate(collider);
        return decoration;
    }

    private static GameObject Primitive(
        string name,
        Transform parent,
        Vector3 localPosition,
        Vector3 scale,
        Material material,
        Vector3? localEuler = null,
        PrimitiveType primitiveType = PrimitiveType.Cube)
    {
        var gameObject = GameObject.CreatePrimitive(primitiveType);
        gameObject.name = name;
        gameObject.transform.SetParent(parent, false);
        gameObject.transform.localPosition = localPosition;
        gameObject.transform.localEulerAngles = localEuler ?? Vector3.zero;
        gameObject.transform.localScale = scale;
        gameObject.GetComponent<Renderer>().sharedMaterial = material;
        return gameObject;
    }

    private static Material Material(
        string name,
        Color color,
        float unlit = 0f,
        float pattern = 0f,
        float emission = 0f,
        Color? emissionColor = null,
        float panelScale = 1f,
        float wear = 0f)
    {
        var path = $"{MaterialRoot}/{name}.mat";
        var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
        var shader = Shader.Find(FlatShaderName) ?? throw new InvalidOperationException($"Missing shader {FlatShaderName}.");
        if (existing != null)
        {
            existing.shader = shader;
            existing.SetColor("_Color", color);
            existing.SetFloat("_Unlit", unlit);
            existing.SetFloat("_Pattern", pattern);
            existing.SetFloat("_PanelScale", panelScale);
            existing.SetFloat("_Wear", wear);
            existing.SetFloat("_Emission", emission);
            existing.SetColor("_EmissionColor", emissionColor ?? Color.black);
            EditorUtility.SetDirty(existing);
            return existing;
        }

        var material = new Material(shader) { name = name };
        material.SetColor("_Color", color);
        material.SetFloat("_Unlit", unlit);
        material.SetFloat("_Pattern", pattern);
        material.SetFloat("_PanelScale", panelScale);
        material.SetFloat("_Wear", wear);
        material.SetFloat("_Emission", emission);
        material.SetColor("_EmissionColor", emissionColor ?? Color.black);
        AssetDatabase.CreateAsset(material, path);
        return material;
    }

    private static void UpdateExistingMaterials()
    {
        Material("DeckFloor", new Color(0.055f, 0.075f, 0.09f), pattern: 1f, panelScale: 0.82f, wear: 0.22f);
        Material("DeckBulkhead", new Color(0.135f, 0.17f, 0.2f), pattern: 1f, panelScale: 0.68f, wear: 0.16f);
        Material("DeckCeiling", new Color(0.04f, 0.055f, 0.07f), pattern: 1f, panelScale: 0.72f, wear: 0.12f);
        Material("DeckTrim", new Color(0.46f, 0.17f, 0.028f), 0.08f, pattern: 2f, panelScale: 1.4f, wear: 0.22f);
        Material("CockpitBlue", new Color(0.055f, 0.14f, 0.23f));
        Material("EngineRed", new Color(0.3f, 0.065f, 0.035f));
        Material("ModuleGreen", new Color(0.07f, 0.2f, 0.16f));
        Material("ConsoleDark", new Color(0.055f, 0.075f, 0.09f));
        Material("ScreenCyan", new Color(0.025f, 0.22f, 0.27f), 1f, emission: 0.92f, emissionColor: new Color(0.06f, 0.72f, 0.92f));
        Material("WarningAmber", new Color(0.38f, 0.16f, 0.025f), 1f, emission: 1.05f, emissionColor: new Color(1f, 0.34f, 0.045f));
        Material("EngineGlow", new Color(0.36f, 0.025f, 0.012f), 1f, emission: 1.35f, emissionColor: new Color(1f, 0.11f, 0.025f));
        Material("InsetMetal", new Color(0.025f, 0.045f, 0.06f), pattern: 1f, panelScale: 1.15f, wear: 0.2f);
        Material("ConduitSteel", new Color(0.22f, 0.27f, 0.3f), pattern: 2f, panelScale: 2.2f, wear: 0.2f);
        Material("SpaceBlack", new Color(0.004f, 0.008f, 0.018f), 1f);
        Material("Starlight", new Color(0.35f, 0.55f, 0.72f), 1f, emission: 1.45f, emissionColor: new Color(0.65f, 0.84f, 1f));
        Material("PlanetBlue", new Color(0.025f, 0.12f, 0.2f), 1f, emission: 0.3f, emissionColor: new Color(0.08f, 0.25f, 0.38f));
        Material("LightPoolCyan", new Color(0.015f, 0.08f, 0.1f), 1f, emission: 0.18f, emissionColor: new Color(0.02f, 0.2f, 0.28f));
        Material("CargoTan", new Color(0.37f, 0.25f, 0.13f));
        Material("BerthBlue", new Color(0.12f, 0.25f, 0.38f));
        AssetDatabase.SaveAssets();
    }

    private static void ImportRuntimeScript(string path, Type expectedType)
    {
        AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
        var script = AssetDatabase.LoadAssetAtPath<MonoScript>(path);
        var actualType = script?.GetClass();
        if (script == null || actualType == null || actualType.FullName != expectedType.FullName)
        {
            throw new InvalidOperationException($"Unity could not bind {path} to {expectedType.FullName}; actual type was {actualType?.AssemblyQualifiedName ?? "<null>"}.");
        }
    }

    private static T AddScript<T>(GameObject gameObject, string path) where T : Component
    {
        var script = AssetDatabase.LoadAssetAtPath<MonoScript>(path);
        var component = gameObject.AddComponent(script.GetClass());
        return (T)component;
    }
}
