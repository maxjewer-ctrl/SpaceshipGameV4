using System.IO;
using Kestrel.Sim;
using UnityEditor;
using UnityEngine;

namespace Kestrel.Editor;

public static class KestrelContentSync
{
    private const string SourceModulesPath = "../src/content/modules.json";
    private const string TargetDir = "Assets/Resources/KestrelContent";
    private const string TargetModulesPath = TargetDir + "/modules.json";

    [MenuItem("Kestrel/Content/Sync Browser Content")]
    public static void SyncBrowserContent()
    {
        var source = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), SourceModulesPath));
        if (!File.Exists(source))
        {
            throw new FileNotFoundException($"Browser module content not found at {source}");
        }

        Directory.CreateDirectory(TargetDir);
        File.Copy(source, TargetModulesPath, true);
        AssetDatabase.ImportAsset(TargetModulesPath);

        var json = File.ReadAllText(TargetModulesPath);
        var catalog = ModuleCatalog.ParseModulesJson(json);
        if (catalog.Definitions.Count == 0)
        {
            throw new InvalidDataException("No module definitions were parsed from browser content.");
        }

        Debug.Log($"Synced {catalog.Definitions.Count} module definitions to {TargetModulesPath}.");
    }
}
