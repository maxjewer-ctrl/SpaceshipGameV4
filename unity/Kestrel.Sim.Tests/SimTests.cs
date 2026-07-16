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
    public void DayUpkeepMatchesBrowserDerivedTraces()
    {
        using var fixture = LoadFixture("upkeep-traces.json");

        var crisis = GameStateFactory.CreateScenario("fresh", 8919);
        crisis.Food = 0;
        crisis.Credits = 0;
        crisis.Prestige = 5;
        crisis.Crew.Add(new CrewState { Id = "ari-vale", Name = "Ari Vale", Role = "pilot", Salary = 8 });
        crisis.Crew.Add(new CrewState { Id = "bo-mercer", Name = "Bo Mercer", Role = "gunner", Salary = 8 });
        AssertTrace(fixture.RootElement.GetProperty("crisis"), crisis, 6);

        var recovery = GameStateFactory.CreateScenario("fresh", 8919);
        recovery.Food = 10;
        recovery.Credits = 20;
        recovery.Prestige = 2;
        recovery.Starve = 3;
        recovery.Unpaid = 2;
        recovery.Crew.Add(new CrewState { Id = "cora-wynn", Name = "Cora Wynn", Role = "gunner", Salary = 8 });
        AssertTrace(fixture.RootElement.GetProperty("recovery"), recovery, 1);

        var hydroponics = GameStateFactory.CreateScenario("trader", 8919);
        AssertTrace(fixture.RootElement.GetProperty("hydroponics"), hydroponics, 1);
    }

    [Fact]
    public void UpkeepStateRoundTripsAndOlderV16SubsetDefaultsSafely()
    {
        var state = GameStateFactory.CreateScenario("trader", 8919);
        state.Starve = 2;
        state.Unpaid = 1;
        state.Crew[0].Salary = 11;
        state.Crew[0].DaysAboard = 27;
        var restored = SaveCodec.Deserialize(SaveCodec.Serialize(state));

        Assert.Equal(2, restored.Starve);
        Assert.Equal(1, restored.Unpaid);
        Assert.Equal(11, restored.Crew[0].Salary);
        Assert.Equal(27, restored.Crew[0].DaysAboard);

        var legacyJson = SaveCodec.Serialize(GameStateFactory.CreateScenario("trader", 8919))
            .Replace("\"starve\":0,", "")
            .Replace("\"unpaid\":0,", "")
            .Replace("\"over\":false,", "")
            .Replace("\"dead\":false,", "")
            .Replace("\"salary\":8,", "")
            .Replace("\"daysAboard\":12,", "");
        var legacy = SaveCodec.Deserialize(legacyJson);
        Assert.Equal(0, legacy.Starve);
        Assert.Equal(0, legacy.Unpaid);
        Assert.False(legacy.Over);
        Assert.False(legacy.Dead);
        Assert.All(legacy.Crew, crew => Assert.Equal(8, crew.Salary));
        Assert.All(legacy.Crew, crew => Assert.Equal(0, crew.DaysAboard));
    }

    [Fact]
    public void CaptainAppearanceMatchesBrowserVocabularyAndRoundTripsInV16()
    {
        Assert.Equal(
            new[] { "explorer", "female-explorer", "alien-explorer" },
            CaptainAppearance.ModelIds);

        var state = GameStateFactory.CreateScenario("fresh", 8919);
        state.Appearance.Model = CaptainAppearance.AlienExplorer;
        var restored = SaveCodec.Deserialize(SaveCodec.Serialize(state));

        Assert.Equal(GameState.CurrentVersion, restored.Version);
        Assert.Equal(CaptainAppearance.AlienExplorer, restored.Appearance.Model);
    }

    [Fact]
    public void OlderOrUnknownV16CaptainAppearanceDefaultsToExplorer()
    {
        var serialized = SaveCodec.Serialize(GameStateFactory.CreateScenario("fresh", 8919));
        var withoutAppearance = serialized.Replace("\"appearance\":{\"model\":\"explorer\"},", "");
        var unknownAppearance = serialized.Replace("\"model\":\"explorer\"", "\"model\":\"unknown-captain\"");

        Assert.Equal(CaptainAppearance.Explorer, SaveCodec.Deserialize(withoutAppearance).Appearance.Model);
        Assert.Equal(CaptainAppearance.Explorer, SaveCodec.Deserialize(unknownAppearance).Appearance.Model);
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

    private static JsonDocument LoadFixture(string fileName = "scenario-projections.json")
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);
        return JsonDocument.Parse(File.ReadAllText(path));
    }

    private static void AssertTrace(JsonElement expectedTrace, GameState state, int ticks)
    {
        var expected = expectedTrace.EnumerateArray().ToArray();
        Assert.Equal(ticks + 1, expected.Length);
        AssertJsonEqual(expected[0].GetRawText(), UpkeepSnapshot(state), "upkeep initial");
        for (var tick = 0; tick < ticks; tick++)
        {
            GameLoop.DayTick(state, false);
            AssertJsonEqual(expected[tick + 1].GetRawText(), UpkeepSnapshot(state), $"upkeep tick {tick + 1}");
        }
    }

    private static string UpkeepSnapshot(GameState state) => JsonSerializer.Serialize(new
    {
        state.Day,
        state.Credits,
        state.Food,
        state.Prestige,
        Starve = state.Starve,
        Unpaid = state.Unpaid,
        Over = state.Over,
        Dead = state.Dead,
        Crew = state.Crew.Select(crew => new { crew.Name, crew.Role, crew.Salary, crew.DaysAboard })
    }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    private static void AssertJsonEqual(string expected, string actual, string context)
    {
        var expectedNode = JsonNode.Parse(expected);
        var actualNode = JsonNode.Parse(actual);
        Assert.True(JsonNode.DeepEquals(expectedNode, actualNode), $"{context}\nEXPECTED: {expected}\nACTUAL:   {actual}");
    }
}
