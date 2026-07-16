using System.Collections.Generic;

namespace Kestrel.Sim;

public sealed class GameState
{
    public const int CurrentVersion = 16;

    public int Version { get; set; } = CurrentVersion;
    public int Seed { get; set; }
    public string Scenario { get; set; } = "fresh";
    public ShipState Ship { get; set; } = new();
    public List<CrewState> Crew { get; set; } = new();
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
}

public sealed class CrewState
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public int PostSlot { get; set; }
}

public sealed class CanonicalScenario
{
    public string Name { get; set; } = "";
    public int Seed { get; set; }
    public string Json { get; set; } = "";
    public string Hash { get; set; } = "";
}
