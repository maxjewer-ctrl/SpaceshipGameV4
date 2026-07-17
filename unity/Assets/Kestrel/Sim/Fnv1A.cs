using System.Text;

namespace Kestrel.Sim;

public static class Fnv1A
{
    public static string HashUtf8(string value)
    {
        const uint offset = 2166136261u;
        const uint prime = 16777619u;

        var hash = offset;
        foreach (var b in Encoding.UTF8.GetBytes(value))
        {
            hash ^= b;
            hash *= prime;
        }

        return hash.ToString("x8");
    }
}
