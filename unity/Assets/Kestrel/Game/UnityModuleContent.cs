using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

public static class UnityModuleContent
{
    private const string ResourcePath = "KestrelContent/modules";

    public static ModuleCatalog LoadCatalog()
    {
        var asset = Resources.Load<TextAsset>(ResourcePath);
        if (asset == null || string.IsNullOrWhiteSpace(asset.text))
        {
            return ModuleCatalog.Empty;
        }

        return ModuleCatalog.ParseModulesJson(asset.text);
    }
}
