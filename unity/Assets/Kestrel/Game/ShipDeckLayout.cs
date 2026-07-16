using UnityEngine;

namespace Kestrel.Game
{
public sealed class ShipDeckLayout : MonoBehaviour
{
    [SerializeField] private string hull = "kestrel-6";
    [SerializeField] private int bayCount = 6;
    [SerializeField] private Transform? captainConsoleAnchor;

    public string Hull => hull;
    public int BayCount => bayCount;
    public Transform? CaptainConsoleAnchor => captainConsoleAnchor;

    public void Configure(string hullKey, int authoredBayCount, Transform consoleAnchor)
    {
        hull = hullKey;
        bayCount = authoredBayCount;
        captainConsoleAnchor = consoleAnchor;
    }
}
}
