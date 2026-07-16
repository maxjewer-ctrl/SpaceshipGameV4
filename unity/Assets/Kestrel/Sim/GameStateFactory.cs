using System;
using System.Collections.Generic;
using System.Linq;

namespace Kestrel.Sim;

public static class GameStateFactory
{
    private static readonly string[] FreshModules =
    {
        "cockpit",
        "fueltank",
        "cargohold",
        "quarters",
        "hydro",
        "engine"
    };

    private static readonly string[] TraderModules =
    {
        "cockpit",
        "fueltank",
        "cargohold",
        "cargohold",
        "cabin",
        "quarters",
        "hydro",
        "engine"
    };

    public static GameState CreateScenario(string scenario, int seed)
    {
        var normalized = string.IsNullOrWhiteSpace(scenario) ? "fresh" : scenario.Trim().ToLowerInvariant();
        var modules = normalized == "trader" ? TraderModules : FreshModules;
        var rng = new DeterministicRng(seed);

        return new GameState
        {
            Seed = seed,
            Scenario = normalized,
            Ship = new ShipState
            {
                Hull = modules.Length <= 6 ? "kestrel-6" : "kestrel-8",
                BayCount = modules.Length,
                Modules = modules.Select((key, slot) => new ModuleState
                {
                    Slot = slot,
                    Key = key,
                    Powered = key is not "hydro" || rng.NextInt(0, 2) == 1
                }).ToList()
            },
            Crew = CreateCrew(normalized, modules.Length)
        };
    }

    public static CanonicalScenario Canonicalize(string scenario, int seed)
    {
        var state = CreateScenario(scenario, seed);
        var json = SaveCodec.Serialize(state);
        return new CanonicalScenario
        {
            Name = state.Scenario,
            Seed = seed,
            Json = json,
            Hash = Fnv1A.HashUtf8(json)
        };
    }

    private static List<CrewState> CreateCrew(string scenario, int bayCount)
    {
        var crew = new List<CrewState>
        {
            new() { Id = "juno", Name = "Juno", Role = "pilot", PostSlot = 0 },
            new() { Id = "bapu", Name = "Bapu", Role = "engineer", PostSlot = bayCount - 1 }
        };

        if (scenario == "trader")
        {
            crew.Add(new CrewState { Id = "miri", Name = "Miri", Role = "broker", PostSlot = Math.Min(2, bayCount - 1) });
        }

        return crew;
    }
}
