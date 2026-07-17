using System.Collections.Generic;

namespace Kestrel.Sim;

public sealed class GameState
{
    public const int CurrentVersion = 16;
    public int Version { get; set; } = CurrentVersion;
    public int Seed { get; set; }
    public int RngState { get; set; }
    public string Scenario { get; set; } = "fresh";
    public string ShipName { get; set; } = "Kestrel";
    public int Day { get; set; } = 1;
    public int Credits { get; set; } = 500;
    public float Fuel { get; set; } = 30f;
    public int Food { get; set; } = 20;
    public int Hull { get; set; } = 100;
    public int HullMax { get; set; } = 100;
    public int Prestige { get; set; }
    public int Starve { get; set; }
    public int Unpaid { get; set; }
    public bool Over { get; set; }
    public bool Dead { get; set; }
    public int EngineLevel { get; set; } = 1;
    public string Location { get; set; } = "solace";
    public bool Docked { get; set; } = true;
    public AppearanceState Appearance { get; set; } = new();
    public ShipState Ship { get; set; } = new();
    public List<CrewState> Crew { get; set; } = new();
    public List<ContractState> Offers { get; set; } = new();
    public List<ContractState> Jobs { get; set; } = new();
    public TravelState? Travel { get; set; }
    public LaneEventState? LaneEvent { get; set; }
    public List<string> Log { get; set; } = new();
}

public sealed class AppearanceState
{
    public string Model { get; set; } = CaptainAppearance.Explorer;
}

public static class CaptainAppearance
{
    public const string Explorer = "explorer";
    public const string FemaleExplorer = "female-explorer";
    public const string AlienExplorer = "alien-explorer";

    public static readonly IReadOnlyList<string> ModelIds = new[]
    {
        Explorer,
        FemaleExplorer,
        AlienExplorer
    };

    public static bool IsSupported(string? modelId) =>
        modelId == Explorer || modelId == FemaleExplorer || modelId == AlienExplorer;

    public static string Normalize(string? modelId) =>
        IsSupported(modelId) ? modelId! : Explorer;
}

public sealed class ShipState
{
    public string Hull { get; set; } = "kestrel-6";
    public int BayCount { get; set; } = 6;
    public List<ModuleState> Modules { get; set; } = new();
}

public sealed class ModuleState
{
    public int Slot { get; set; }
    public string Key { get; set; } = "";
    public bool Powered { get; set; } = true;
    public bool Damaged { get; set; }
    public int Mark { get; set; } = 1;
}

public sealed class CrewState
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public int Salary { get; set; }
    public int DaysAboard { get; set; }
    public int PostSlot { get; set; }
}

public sealed class ContractState
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Destination { get; set; } = "";
    public int Pay { get; set; }
    public int Prestige { get; set; }
}

public sealed class TravelState
{
    public string From { get; set; } = "";
    public string Destination { get; set; } = "";
    public int Total { get; set; }
    public int Left { get; set; }
    public bool Encountered { get; set; }
}

public sealed class LaneEventState
{
    public string Key { get; set; } = LaneEvents.TinkerTrader;
}

public static class LaneEvents
{
    public const string TinkerTrader = "tinker-trader";
    public const string BuyFood = "buy-food";
    public const string Dismiss = "dismiss";

    public static bool IsSupported(string? eventKey) => eventKey == TinkerTrader;
}

public sealed class CanonicalScenario
{
    public string Name { get; set; } = "";
    public int Seed { get; set; }
    public string Json { get; set; } = "";
    public string Hash { get; set; } = "";
}
