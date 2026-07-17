using System.IO;
using System.Linq;
using Kestrel.Game;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Kestrel.Editor;

public static class KestrelProjectSetup
{
    public const string ShipDeckScenePath = "Assets/Scenes/KestrelShipDeck.unity";

    [MenuItem("Kestrel/Setup/Ensure Project")]
    public static void EnsureProject()
    {
        Directory.CreateDirectory("Assets/Scenes");
        Directory.CreateDirectory("Assets/Kestrel/Content");
        KestrelContentSync.SyncBrowserContent();
        KestrelShipPrefabBuilder.EnsurePrefabs();
        KestrelCaptainPrefabBuilder.EnsurePrefabs();
        EnsureStarterScene();

        EditorBuildSettings.scenes = new[]
        {
            new EditorBuildSettingsScene(ShipDeckScenePath, true)
        };

        PlayerSettings.companyName = "Kestrel";
        PlayerSettings.productName = "The Kestrel Run";
        PlayerSettings.WebGL.template = "PROJECT:Kestrel";
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.WebGL, ScriptingImplementation.IL2CPP);
        EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
        AssetDatabase.SaveAssets();
    }

    private static void EnsureStarterScene()
    {
        var scene = File.Exists(ShipDeckScenePath)
            ? EditorSceneManager.OpenScene(ShipDeckScenePath, OpenSceneMode.Single)
            : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        var runtime = Object.FindFirstObjectByType<ShipDeckRuntime>();
        if (runtime == null)
        {
            var runtimeObject = new GameObject("Kestrel Runtime");
            runtime = runtimeObject.AddComponent<ShipDeckRuntime>();
        }

        var preview = runtime.transform.Find(ShipDeckRuntime.EditorPreviewName);
        if (preview == null)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(KestrelShipPrefabBuilder.SixBayPrefabPath);
            if (prefab == null) throw new BuildFailedException($"Missing ship preview prefab at {KestrelShipPrefabBuilder.SixBayPrefabPath}.");
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, runtime.transform);
            instance.name = ShipDeckRuntime.EditorPreviewName;
            instance.transform.SetLocalPositionAndRotation(Vector3.zero, Quaternion.identity);
            instance.transform.localScale = Vector3.one;
        }

        EditorSceneManager.MarkSceneDirty(scene);
        EditorSceneManager.SaveScene(scene, ShipDeckScenePath);
    }

    [MenuItem("Kestrel/Level/Create Level From Template")]
    public static void CreateLevelFromTemplate()
    {
        EnsureProject();
        EditorSceneManager.OpenScene(ShipDeckScenePath);
    }

    [MenuItem("Kestrel/Level/Validate Open Level")]
    public static void ValidateOpenLevelMenu()
    {
        var result = KestrelLevelValidator.ValidateOpenLevel();
        if (result.Errors.Count > 0)
        {
            throw new BuildFailedException(string.Join("\n", result.Errors));
        }

        Debug.Log($"Kestrel level validation passed with {result.Warnings.Count} warning(s).");
    }

    [MenuItem("Kestrel/Scenario/Play Fresh Seed")]
    public static void PlayFreshSeed()
    {
        EditorSceneManager.OpenScene(ShipDeckScenePath);
        EditorApplication.isPlaying = true;
    }
}
