using System.Collections;
using System.Linq;
using Kestrel.Game;
using Kestrel.Sim;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Kestrel.Tests;

public sealed class ShipDeckPlayModeTests
{
    [UnityTest]
    public IEnumerator RuntimeSpawnsPlayerAndSockets()
    {
        var go = new GameObject("play-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();
        runtime.BuildScenario("fresh", 8919);

        yield return null;

        Assert.That(Object.FindFirstObjectByType<KestrelPlayerController>(), Is.Not.Null);
        Assert.That(runtime.Sockets.Count, Is.EqualTo(6));
        Assert.That(runtime.UsingAuthoredDeck, Is.True);
        Assert.That(runtime.CaptainModelId, Is.EqualTo("explorer"));
        Assert.That(runtime.CaptainAnimator, Is.Not.Null);
        Assert.That(runtime.CaptainPicker, Is.Not.Null);
        Assert.That(runtime.CaptainPicker?.IsOpen, Is.True);
        Object.Destroy(go);
    }

    [UnityTest]
    public IEnumerator RuntimeCanSwitchAllCharacterPickerModels()
    {
        var go = new GameObject("captain-picker-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();
        runtime.BuildScenario("fresh", 8919);

        foreach (var modelId in new[] { "explorer", "female-explorer", "alien-explorer" })
        {
            runtime.SetCaptainModel(modelId);
            yield return null;
            Assert.That(runtime.CaptainModelId, Is.EqualTo(modelId));
            Assert.That(runtime.CaptainAnimator?.runtimeAnimatorController, Is.Not.Null);
        }

        Object.Destroy(go);
    }

    [UnityTest]
    public IEnumerator CaptainSelectionSurvivesScenarioRebuildAndSaveLoad()
    {
        var go = new GameObject("captain-save-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();
        runtime.BuildScenario("fresh", 8919);
        runtime.SetCaptainModel(CaptainAppearance.AlienExplorer);
        runtime.SaveCurrent();

        runtime.BuildScenario("trader", 42);
        Assert.That(runtime.CaptainModelId, Is.EqualTo(CaptainAppearance.AlienExplorer));
        Assert.That(runtime.State.Appearance.Model, Is.EqualTo(CaptainAppearance.AlienExplorer));

        runtime.SetCaptainModel(CaptainAppearance.FemaleExplorer);
        Assert.That(runtime.LoadSaved(), Is.True);
        yield return null;

        Assert.That(runtime.CaptainModelId, Is.EqualTo(CaptainAppearance.AlienExplorer));
        Assert.That(runtime.CaptainAnimator?.runtimeAnimatorController, Is.Not.Null);
        PlayerPrefs.DeleteKey("kestrelrun:unity:slot0");
        Object.Destroy(go);
    }

    [UnityTest]
    public IEnumerator ContractTravelAndSaveLoadWorkThroughRuntime()
    {
        var go = new GameObject("loop-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();
        runtime.BuildScenario("fresh", 8919);
        Assert.That(runtime.RunTransferLoop(), Is.True);
        Assert.That(runtime.State.Location, Is.EqualTo("foundry"));
        Assert.That(runtime.State.Credits, Is.EqualTo(740));
        runtime.SaveCurrent();
        runtime.BuildScenario("trader", 42);
        Assert.That(runtime.LoadSaved(), Is.True);
        Assert.That(runtime.State.Location, Is.EqualTo("foundry"));
        Assert.That(runtime.State.Credits, Is.EqualTo(740));
        yield return null;
        PlayerPrefs.DeleteKey("kestrelrun:unity:slot0");
        Object.Destroy(go);
    }

    [UnityTest]
    public IEnumerator DockedWaitAppliesBrowserParityUpkeep()
    {
        var go = new GameObject("upkeep-runtime");
        var runtime = go.AddComponent<ShipDeckRuntime>();
        runtime.BuildScenario("trader", 8919);

        Assert.That(runtime.WaitDay(), Is.True);
        Assert.That(runtime.State.Day, Is.EqualTo(15));
        Assert.That(runtime.State.Food, Is.EqualTo(25));
        Assert.That(runtime.State.Credits, Is.EqualTo(1784));
        Assert.That(runtime.State.Crew.All(crew => crew.DaysAboard == 13), Is.True);

        yield return null;
        Object.Destroy(go);
    }
}
