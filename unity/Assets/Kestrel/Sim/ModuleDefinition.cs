namespace Kestrel.Sim;

public sealed class ModuleDefinition
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Icon { get; set; } = "";
    public int Price { get; set; }
    public int PowerDraw { get; set; }
    public bool Core { get; set; }
}
