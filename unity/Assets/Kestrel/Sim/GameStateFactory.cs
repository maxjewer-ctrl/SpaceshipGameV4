using System;
using System.Collections.Generic;
using System.Linq;

namespace Kestrel.Sim;

public static class GameStateFactory
{
    private sealed class ScenarioDefinition
    {
        public string ShipName { get; set; } = "Kestrel";
        public int Day { get; set; } = 1;
        public int Credits { get; set; } = 500;
        public float Fuel { get; set; } = 30f;
        public int Food { get; set; } = 20;
        public int Prestige { get; set; }
        public int EngineLevel { get; set; } = 1;
        public int RngDraws { get; set; } = 57;
        public int BayCount { get; set; } = 6;
        public string[] Modules { get; set; } = Array.Empty<string>();
        public (string Name, string Role)[] Crew { get; set; } = Array.Empty<(string, string)>();
    }

    private static readonly Dictionary<string, ScenarioDefinition> Scenarios = new()
    {
        ["fresh"] = new()
        {
            Modules = new[] { "fueltank", "cargohold", "cabin", "quarters", "workshop" }
        },
        ["trader"] = new()
        {
            ShipName = "Marrow's Luck", Day = 14, Credits = 1800, Fuel = 36f, Food = 26, Prestige = 4, BayCount = 8, RngDraws = 95,
            Modules = new[] { "fueltank", "cargohold", "cargohold", "cabin", "quarters", "quarters", "hydro", "workshop" },
            Crew = new[] { ("Odile Vance", "pilot"), ("Kesh Barlow", "mechanic") }
        },
        ["fighter"] = new()
        {
            ShipName = "Spite & Polish", Day = 20, Credits = 900, Fuel = 38f, Food = 22, Prestige = 6, EngineLevel = 2, BayCount = 10, RngDraws = 101,
            Modules = new[] { "fueltank", "cargohold", "quarters", "hydro", "workshop", "weapons", "weapons", "shields", "armory" },
            Crew = new[] { ("Rex Calloway", "gunner"), ("Pia Osei", "mechanic") }
        },
        ["silence"] = new()
        {
            ShipName = "Long Ear", Day = 17, Credits = 1400, Fuel = 40f, Food = 30, Prestige = 5, BayCount = 8, RngDraws = 95,
            Modules = new[] { "fueltank", "cargohold", "cargohold", "cabin", "quarters", "hydro", "workshop" },
            Crew = new[] { ("Dane Okoro", "pilot"), ("Sef Adeyemi", "cook") }
        },
        ["arc"] = new()
        {
            ShipName = "Twelve Stars", Day = 30, Credits = 2500, Fuel = 60f, Food = 35, Prestige = 12, EngineLevel = 2, BayCount = 10, RngDraws = 101,
            Modules = new[] { "fueltank", "fueltank", "cargohold", "cabin", "quarters", "hydro", "workshop", "weapons", "shields" },
            Crew = new[] { ("Odile Vance", "pilot"), ("Rex Calloway", "gunner"), ("Kesh Barlow", "mechanic") }
        },
        ["run"] = new()
        {
            ShipName = "Last Light", Day = 44, Credits = 800, Fuel = 80f, Food = 44, Prestige = 14, EngineLevel = 3, BayCount = 10, RngDraws = 101,
            Modules = new[] { "fueltank", "fueltank", "cargohold", "quarters", "hydro", "workshop", "weapons", "weapons", "shields" },
            Crew = new[] { ("Odile Vance", "pilot"), ("Rex Calloway", "gunner"), ("Kesh Barlow", "mechanic") }
        },
        ["reckoning"] = new()
        {
            ShipName = "Verdict", Day = 52, Credits = 3200, Fuel = 70f, Food = 40, Prestige = 15, EngineLevel = 3, BayCount = 10, RngDraws = 101,
            Modules = new[] { "fueltank", "fueltank", "cargohold", "cabin", "quarters", "hydro", "workshop", "weapons", "shields" },
            Crew = new[] { ("Odile Vance", "pilot"), ("Ansel Grey", "medic"), ("Kesh Barlow", "mechanic") }
        }
    };

    public static IReadOnlyCollection<string> ScenarioNames => Scenarios.Keys;

    public static GameState CreateScenario(string scenario, int seed)
    {
        var normalized = string.IsNullOrWhiteSpace(scenario) ? "fresh" : scenario.Trim().ToLowerInvariant();
        if (!Scenarios.TryGetValue(normalized, out var definition))
        {
            normalized = "fresh";
            definition = Scenarios[normalized];
        }

        var rng = new DeterministicRng(seed);
        for (var draw = 0; draw < definition.RngDraws; draw++) rng.NextDouble();

        var state = new GameState
        {
            Seed = seed,
            RngState = rng.State,
            Scenario = normalized,
            ShipName = definition.ShipName,
            Day = definition.Day,
            Credits = definition.Credits,
            Fuel = definition.Fuel,
            Food = definition.Food,
            Prestige = definition.Prestige,
            EngineLevel = definition.EngineLevel,
            Ship = new ShipState
            {
                Hull = $"kestrel-{definition.BayCount}",
                BayCount = definition.BayCount,
                Modules = definition.Modules.Select((key, slot) => new ModuleState
                {
                    Slot = slot,
                    Key = key,
                    Powered = true,
                    Mark = 1
                }).ToList()
            },
            Crew = definition.Crew.Select((crew, index) => new CrewState
            {
                Id = Slug(crew.Name),
                Name = crew.Name,
                Role = crew.Role,
                Salary = 8,
                DaysAboard = 12,
                PostSlot = Math.Min(index, Math.Max(0, definition.BayCount - 1))
            }).ToList()
        };

        state.Offers.Add(new ContractState
        {
            Id = 1001,
            Title = "Foundry calibration run",
            Destination = "foundry",
            Pay = 240,
            Prestige = 1
        });
        state.Log.Add($"Scenario loaded: {normalized} (seed {seed}).");
        return state;
    }

    public static CanonicalScenario Canonicalize(string scenario, int seed)
    {
        var state = CreateScenario(scenario, seed);
        var json = PortSnapshotCodec.Serialize(state);
        return new CanonicalScenario
        {
            Name = state.Scenario,
            Seed = seed,
            Json = json,
            Hash = Fnv1A.HashUtf8(json)
        };
    }

    private static string Slug(string value) => value.ToLowerInvariant().Replace("'", "").Replace(" ", "-");
}
