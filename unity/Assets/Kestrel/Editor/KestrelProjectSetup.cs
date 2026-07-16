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

        if (!File.Exists(ShipDeckScenePath))
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            scene.name = "KestrelShipDeck";
            EditorSceneManager.SaveScene(scene, ShipDeckScenePath);
        }

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
