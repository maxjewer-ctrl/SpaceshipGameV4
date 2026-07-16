using Kestrel.Sim;
using Xunit;

namespace Kestrel.Sim.Tests;

public sealed class SimTests
{
    [Fact]
    public void RngIsDeterministic()
    {
        var a = new DeterministicRng(8919);
        var b = new DeterministicRng(8919);

        Assert.Equal(
            Enumerable.Range(0, 8).Select(_ => a.NextUInt()).ToArray(),
            Enumerable.Range(0, 8).Select(_ => b.NextUInt()).ToArray());
    }

    [Theory]
    [InlineData("fresh", 8919)]
    [InlineData("trader", 424242)]
    public void ScenarioRoundTripsThroughV16Save(string scenario, int seed)
    {
        var state = GameStateFactory.CreateScenario(scenario, seed);
        var json = SaveCodec.Serialize(state);
        var restored = SaveCodec.Deserialize(json);

        Assert.Equal(GameState.CurrentVersion, restored.Version);
        Assert.Equal(seed, restored.Seed);
        Assert.Equal(state.Ship.BayCount, restored.Ship.Modules.Count);
        Assert.Equal(state.Ship.Modules.Select(m => m.Slot), restored.Ship.Modules.Select(m => m.Slot));
    }

    [Theory]
    [InlineData("fresh", 8919, "0e4da672")]
    [InlineData("trader", 424242, "70093eeb")]
    public void CanonicalScenarioHashesStayStable(string scenario, int seed, string expectedHash)
    {
        var canonical = GameStateFactory.Canonicalize(scenario, seed);

        Assert.Equal(expectedHash, canonical.Hash);
    }

    [Fact]
    public void ModuleSlotsAreUniqueAndContiguous()
    {
        var state = GameStateFactory.CreateScenario("trader", 1);
        var slots = state.Ship.Modules.Select(m => m.Slot).OrderBy(slot => slot).ToArray();

        Assert.Equal(Enumerable.Range(0, state.Ship.BayCount), slots);
    }
}
