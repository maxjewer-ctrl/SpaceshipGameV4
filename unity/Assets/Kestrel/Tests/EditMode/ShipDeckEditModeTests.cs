using System.Linq;
using Kestrel.Editor;
using Kestrel.Game;
using Kestrel.Sim;
using NUnit.Framework;
using UnityEditor;
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
        Assert.That(runtime.State.Ship.Modules.Count, Is.EqualTo(5));
        Assert.That(runtime.UsingAuthoredDeck, Is.True);
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
        var moduleKeys = GameStateFactory.ScenarioNames
            .SelectMany(name => GameStateFactory.CreateScenario(name, 424242).Ship.Modules)
            .Select(module => module.Key)
            .Distinct();

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

    [Test]
    public void AuthoredSixBayPrefabHasCompleteLevelContract()
    {
        var result = KestrelLevelValidator.ValidatePrefabAtPath(KestrelShipPrefabBuilder.SixBayPrefabPath);
        Assert.That(result.Errors, Is.Empty);

        var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(KestrelShipPrefabBuilder.SixBayPrefabPath);
        var sockets = prefab.GetComponentsInChildren<ModuleBaySocket>(true).OrderBy(socket => socket.Slot).ToArray();
        Assert.That(sockets.Select(socket => socket.Slot), Is.EqualTo(Enumerable.Range(0, 6)));
        Assert.That(sockets.All(socket => socket.InteractionAnchor != null), Is.True);
        Assert.That(sockets.All(socket => socket.RoomCollider != null), Is.True);
    }

    [TestCase("explorer", 15)]
    [TestCase("female-explorer", 9)]
    [TestCase("alien-explorer", 9)]
    public void CaptainSourcesAndNativePrefabsRetainAnimationSets(string modelId, int expectedClipCount)
    {
        var sourcePath = KestrelCaptainPrefabBuilder.SourcePathFor(modelId);
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(sourcePath);
        var sourceClips = AssetDatabase.LoadAllAssetsAtPath(sourcePath).OfType<AnimationClip>().ToArray();
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(KestrelCaptainPrefabBuilder.PrefabPathFor(modelId));

        Assert.That(source, Is.Not.Null, $"Missing retained source model at {sourcePath}.");
        Assert.That(sourceClips.Length, Is.EqualTo(expectedClipCount));
        Assert.That(prefab, Is.Not.Null, "Run Kestrel > Characters > Rebuild Captain Prefabs.");
        Assert.That(prefab.GetComponentInChildren<Animator>(true)?.runtimeAnimatorController, Is.Not.Null);
        Assert.That(prefab.GetComponentsInChildren<SkinnedMeshRenderer>(true), Is.Not.Empty);

        var nativeAnimationFolder = $"{KestrelCaptainPrefabBuilder.NativeRoot}/{prefab.name}/Animations";
        var nativeClips = AssetDatabase.FindAssets("t:AnimationClip", new[] { nativeAnimationFolder });
        Assert.That(nativeClips.Length, Is.EqualTo(expectedClipCount));
    }
}
