using System.Linq;
using Kestrel.Editor;
using Kestrel.Game;
using Kestrel.Sim;
using NUnit.Framework;
using UnityEngine;

namespace Kestrel.Tests;

public sealed class ShipDeckEditModeTests
{
    [Test]
    public void FreshScenarioBuildsSixSockets()
    {
        var go = new GameObject("test-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();

        runtime.BuildScenario("fresh", 8919);

        Assert.That(runtime.Sockets.Count, Is.EqualTo(6));
        Assert.That(runtime.State.Ship.Modules.Count, Is.EqualTo(6));
        Object.DestroyImmediate(go);
    }

    [Test]
    public void TraderScenarioBuildsEightSockets()
    {
        var state = GameStateFactory.CreateScenario("trader", 424242);

        Assert.That(state.Ship.BayCount, Is.EqualTo(8));
        Assert.That(state.Ship.Hull, Is.EqualTo("kestrel-8"));
        Assert.That(state.Ship.Modules.Select(module => module.Key), Does.Contain("cargohold"));
    }

    [Test]
    public void ModuleCatalogParsesBrowserContentShape()
    {
        var json = "{\"cockpit\":{\"n\":\"Cockpit\",\"price\":0,\"core\":true,\"icon\":\"C\",\"d\":\"Bridge\"},\"hydro\":{\"n\":\"Hydroponics Bay\",\"price\":500,\"pw\":2,\"d\":\"Grows food\"}}";
        var catalog = ModuleCatalog.ParseModulesJson(json);

        Assert.That(catalog.Definitions.Count, Is.EqualTo(2));
        Assert.That(catalog.Find("hydro")?.Name, Is.EqualTo("Hydroponics Bay"));
        Assert.That(catalog.Find("hydro")?.PowerDraw, Is.EqualTo(2));
        Assert.That(catalog.Find("cockpit")?.Core, Is.True);
    }

    [Test]
    public void SyncedBrowserModulesCoverUnityScenarios()
    {
        var catalog = UnityModuleContent.LoadCatalog();
        var moduleKeys = GameStateFactory.CreateScenario("trader", 424242).Ship.Modules.Select(module => module.Key).Distinct();

        foreach (var key in moduleKeys)
        {
            Assert.That(catalog.Find(key), Is.Not.Null, $"Missing synced module content for '{key}'. Run scripts/unity.ps1 setup.");
        }
    }

    [Test]
    public void EmptyTemplateSceneIsValidForRuntimeBootstrap()
    {
        var result = KestrelLevelValidator.ValidateOpenLevel();

        Assert.That(result.Errors, Is.Empty);
    }
}
