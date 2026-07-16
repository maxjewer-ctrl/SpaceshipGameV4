using UnityEngine;

namespace Kestrel.Game
{
public sealed class ShipDeckLayout : MonoBehaviour
{
    [SerializeField] private string hull = "kestrel-6";
    [SerializeField] private int bayCount = 6;
    [SerializeField] private int visualRevision;
    [SerializeField] private Transform? captainConsoleAnchor;

    public string Hull => hull;
    public int BayCount => bayCount;
    public int VisualRevision => visualRevision;
    public Transform? CaptainConsoleAnchor => captainConsoleAnchor;

    public void Configure(string hullKey, int authoredBayCount, int authoredVisualRevision, Transform consoleAnchor)
    {
        hull = hullKey;
        bayCount = authoredBayCount;
        visualRevision = authoredVisualRevision;
        captainConsoleAnchor = consoleAnchor;
    }
}
}
