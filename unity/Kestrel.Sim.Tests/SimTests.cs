using System.Text.Json;
using System.Text.Json.Nodes;
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

    [Fact]
    public void EveryBrowserScenarioMatchesThePortableCSharpProjection()
    {
        using var fixture = LoadFixture();
        var seed = fixture.RootElement.GetProperty("seed").GetInt32();
        var expectedScenarios = fixture.RootElement.GetProperty("scenarios").EnumerateArray().ToArray();
        Assert.Equal(GameStateFactory.ScenarioNames.Count, expectedScenarios.Length);

        foreach (var expected in expectedScenarios)
        {
            var scenario = expected.GetProperty("scenario").GetString()!;
            var actual = PortSnapshotCodec.Serialize(GameStateFactory.CreateScenario(scenario, seed));
            AssertJsonEqual(expected.GetRawText(), actual, scenario);
        }
    }

    [Fact]
    public void ModuleSwapMatchesTheBrowserActionTrace()
    {
        using var fixture = LoadFixture();
        var trace = fixture.RootElement.GetProperty("swapTrace");
        var state = GameStateFactory.CreateScenario("fresh", 8919);
        AssertJsonEqual(trace.GetProperty("initial").GetRawText(), PortSnapshotCodec.Serialize(state), "swap initial");
        Assert.True(GameLoop.SwapModules(state, 0, 1));
        AssertJsonEqual(trace.GetProperty("afterSwap").GetRawText(), PortSnapshotCodec.Serialize(state), "swap result");
    }

    [Fact]
    public void ContractTravelLoopCompletesEndToEnd()
    {
        var state = GameStateFactory.CreateScenario("fresh", 8919);
        Assert.True(GameLoop.AcceptContract(state, 1001));
        Assert.True(GameLoop.Depart(state, "foundry"));
        Assert.NotNull(state.Travel);

        while (state.Travel != null) Assert.True(GameLoop.AdvanceTravelDay(state));

        Assert.True(state.Docked);
        Assert.Equal("foundry", state.Location);
        Assert.Equal(4, state.Day);
        Assert.Equal(18f, state.Fuel);
        Assert.Equal(17, state.Food);
        Assert.Equal(740, state.Credits);
        Assert.Equal(1, state.Prestige);
        Assert.Empty(state.Jobs);
    }

    [Fact]
    public void ActiveTravelRoundTripsThroughV16Save()
    {
        var state = GameStateFactory.CreateScenario("fresh", 8919);
        GameLoop.AcceptContract(state, 1001);
        GameLoop.Depart(state, "foundry");
        GameLoop.AdvanceTravelDay(state);
        var restored = SaveCodec.Deserialize(SaveCodec.Serialize(state));

        Assert.Equal(GameState.CurrentVersion, restored.Version);
        Assert.Equal(state.Day, restored.Day);
        Assert.Equal(state.Fuel, restored.Fuel);
        Assert.Equal(state.Jobs.Single().Title, restored.Jobs.Single().Title);
        Assert.Equal(2, restored.Travel?.Left);
    }

    [Fact]
    public void ModuleSlotsStayUniqueAndWithinTheHull()
    {
        foreach (var scenario in GameStateFactory.ScenarioNames)
        {
            var state = GameStateFactory.CreateScenario(scenario, 1);
            var slots = state.Ship.Modules.Select(module => module.Slot).ToArray();
            Assert.Equal(slots.Length, slots.Distinct().Count());
            Assert.All(slots, slot => Assert.InRange(slot, 0, state.Ship.BayCount - 1));
        }
    }

    private static JsonDocument LoadFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "scenario-projections.json");
        return JsonDocument.Parse(File.ReadAllText(path));
    }

    private static void AssertJsonEqual(string expected, string actual, string context)
    {
        var expectedNode = JsonNode.Parse(expected);
        var actualNode = JsonNode.Parse(actual);
        Assert.True(JsonNode.DeepEquals(expectedNode, actualNode), $"{context}\nEXPECTED: {expected}\nACTUAL:   {actual}");
    }
}
