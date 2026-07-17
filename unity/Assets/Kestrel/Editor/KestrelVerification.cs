using System;
using System.IO;
using Kestrel.Game;
using UnityEditor;
using UnityEngine;

namespace Kestrel.Editor;

public static class KestrelVerification
{
    [Serializable]
    private sealed class Report
    {
        public string generatedUtc = "";
        public string unityVersion = "";
        public string prefab = "";
        public int socketCount;
        public string[] errors = Array.Empty<string>();
        public string[] warnings = Array.Empty<string>();
        public bool pass;
    }

    public static void ExportReport()
    {
        var result = KestrelLevelValidator.ValidatePrefabAtPath(KestrelShipPrefabBuilder.SixBayPrefabPath);
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(KestrelShipPrefabBuilder.SixBayPrefabPath);
        var report = new Report
        {
            generatedUtc = DateTime.UtcNow.ToString("O"),
            unityVersion = Application.unityVersion,
            prefab = KestrelShipPrefabBuilder.SixBayPrefabPath,
            socketCount = prefab == null ? 0 : prefab.GetComponentsInChildren<ModuleBaySocket>(true).Length,
            errors = result.Errors.ToArray(),
            warnings = result.Warnings.ToArray(),
            pass = result.Errors.Count == 0
        };

        var directory = Path.GetFullPath(Path.Combine(Application.dataPath, "../../.shots/unity/latest"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "editor-validation.json");
        File.WriteAllText(path, JsonUtility.ToJson(report, true));
        Debug.Log($"Unity verification report: {path}");
        if (!report.pass) throw new InvalidOperationException(string.Join("\n", report.errors));
    }
}
