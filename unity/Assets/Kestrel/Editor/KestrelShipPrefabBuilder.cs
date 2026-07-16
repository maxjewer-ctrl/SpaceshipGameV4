using System;
using System.IO;
using Kestrel.Game;
using UnityEditor;
using UnityEngine;

namespace Kestrel.Editor;

public static class KestrelShipPrefabBuilder
{
    public const string SixBayPrefabPath = "Assets/Resources/Kestrel/Prefabs/KestrelSixBayDeck.prefab";
    private const string MaterialRoot = "Assets/Kestrel/Content/Materials";
    private const string FlatShaderName = "Kestrel/Flat";

    public static void EnsurePrefabs()
    {
        Directory.CreateDirectory(MaterialRoot);
        UpdateExistingMaterials();
        var existing = AssetDatabase.LoadAssetAtPath<GameObject>(SixBayPrefabPath);
        if (existing == null || existing.GetComponent<ShipDeckLayout>() == null)
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

        var floor = Material("DeckFloor", new Color(0.11f, 0.13f, 0.15f));
        var wall = Material("DeckBulkhead", new Color(0.24f, 0.27f, 0.3f));
        var trim = Material("DeckTrim", new Color(0.72f, 0.46f, 0.12f));
        var cockpit = Material("CockpitBlue", new Color(0.08f, 0.2f, 0.32f));
        var engine = Material("EngineRed", new Color(0.34f, 0.11f, 0.08f));
        var module = Material("ModuleGreen", new Color(0.12f, 0.27f, 0.22f));

        var root = new GameObject("Kestrel Six Bay Deck");
        try
        {
            var consoleAnchor = new GameObject("Captain Console Anchor").transform;
            consoleAnchor.SetParent(root.transform, false);
            consoleAnchor.localPosition = new Vector3(0f, 0.25f, -4.5f);
            Primitive("Cockpit Floor", root.transform, new Vector3(0f, 0f, -4.5f), new Vector3(6.8f, 0.16f, 4.2f), cockpit);
            Primitive("Captain Console", consoleAnchor, new Vector3(0f, 0.45f, 0.5f), new Vector3(1.8f, 0.9f, 0.8f), trim);
            Primitive("Forward Viewport", root.transform, new Vector3(0f, 1.7f, -6.55f), new Vector3(4.6f, 1.5f, 0.18f), cockpit);

            for (var slot = 0; slot < 6; slot++)
            {
                var z = slot * 4.5f;
                var roomObject = new GameObject($"Bay {slot:00}");
                roomObject.transform.SetParent(root.transform, false);
                roomObject.transform.localPosition = new Vector3(0f, 0f, z);
                var room = AddScript<ShipBayRoom>(roomObject, "Assets/Kestrel/Game/ShipBayRoom.cs");
                var floorObject = Primitive("Floor", roomObject.transform, Vector3.zero, new Vector3(6.8f, 0.16f, 3.8f), module);
                Primitive("Port Bulkhead", roomObject.transform, new Vector3(-3.35f, 1.35f, 0f), new Vector3(0.18f, 2.7f, 3.8f), wall);
                Primitive("Starboard Bulkhead", roomObject.transform, new Vector3(3.35f, 1.35f, 0f), new Vector3(0.18f, 2.7f, 3.8f), wall);
                Primitive("Aft Threshold", roomObject.transform, new Vector3(0f, 0.1f, 1.9f), new Vector3(6.8f, 0.2f, 0.12f), trim);
                Primitive("Port Equipment", roomObject.transform, new Vector3(-2.45f, 0.75f, 0f), new Vector3(1.25f, 1.35f, 1.4f), module);
                Primitive("Starboard Equipment", roomObject.transform, new Vector3(2.45f, 0.75f, 0f), new Vector3(1.25f, 1.35f, 1.4f), module);

                var socketObject = new GameObject($"Module Socket {slot}");
                socketObject.transform.SetParent(roomObject.transform, false);
                socketObject.transform.localPosition = new Vector3(0f, 0.15f, 0f);
                var anchor = new GameObject("Interaction Anchor").transform;
                anchor.SetParent(socketObject.transform, false);
                anchor.localPosition = new Vector3(0f, 0.8f, -0.8f);
                var socket = AddScript<ModuleBaySocket>(socketObject, "Assets/Kestrel/Game/ModuleBaySocket.cs");
                var floorCollider = floorObject.GetComponent<Collider>();
                socket.Configure(slot, anchor, floorCollider);
                room.Configure(socket, floorCollider);
            }

            var engineZ = 6 * 4.5f;
            Primitive("Engine Room Floor", root.transform, new Vector3(0f, 0f, engineZ), new Vector3(6.8f, 0.16f, 4.2f), engine);
            Primitive("Drive Core", root.transform, new Vector3(0f, 1.1f, engineZ + 0.4f), new Vector3(2.1f, 2.2f, 1.8f), engine);
            Primitive("Port Hull", root.transform, new Vector3(-3.55f, 1.45f, 10.25f), new Vector3(0.22f, 2.9f, 37f), wall);
            Primitive("Starboard Hull", root.transform, new Vector3(3.55f, 1.45f, 10.25f), new Vector3(0.22f, 2.9f, 37f), wall);

            var layout = AddScript<ShipDeckLayout>(root, "Assets/Kestrel/Game/ShipDeckLayout.cs");
            layout.Configure("kestrel-6", 6, consoleAnchor);
            PrefabUtility.SaveAsPrefabAsset(root, SixBayPrefabPath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(root);
        }
    }

    private static GameObject Primitive(string name, Transform parent, Vector3 localPosition, Vector3 scale, Material material)
    {
        var gameObject = GameObject.CreatePrimitive(PrimitiveType.Cube);
        gameObject.name = name;
        gameObject.transform.SetParent(parent, false);
        gameObject.transform.localPosition = localPosition;
        gameObject.transform.localScale = scale;
        gameObject.GetComponent<Renderer>().sharedMaterial = material;
        return gameObject;
    }

    private static Material Material(string name, Color color)
    {
        var path = $"{MaterialRoot}/{name}.mat";
        var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
        var shader = Shader.Find(FlatShaderName) ?? throw new InvalidOperationException($"Missing shader {FlatShaderName}.");
        if (existing != null)
        {
            existing.shader = shader;
            existing.SetColor("_BaseColor", color);
            EditorUtility.SetDirty(existing);
            return existing;
        }
        var material = new Material(shader) { name = name, color = color };
        material.SetColor("_BaseColor", color);
        AssetDatabase.CreateAsset(material, path);
        return material;
    }

    private static void UpdateExistingMaterials()
    {
        Material("DeckFloor", new Color(0.11f, 0.13f, 0.15f));
        Material("DeckBulkhead", new Color(0.24f, 0.27f, 0.3f));
        Material("DeckTrim", new Color(0.72f, 0.46f, 0.12f));
        Material("CockpitBlue", new Color(0.08f, 0.2f, 0.32f));
        Material("EngineRed", new Color(0.34f, 0.11f, 0.08f));
        Material("ModuleGreen", new Color(0.12f, 0.27f, 0.22f));
        AssetDatabase.SaveAssets();
    }

    private static void ImportRuntimeScript(string path, System.Type expectedType)
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
