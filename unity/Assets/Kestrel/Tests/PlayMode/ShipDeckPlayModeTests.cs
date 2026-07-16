using System.Collections;
using Kestrel.Game;
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
        Object.Destroy(go);
    }
}
