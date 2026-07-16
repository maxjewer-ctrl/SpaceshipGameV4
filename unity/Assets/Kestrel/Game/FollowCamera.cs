using UnityEngine;

namespace Kestrel.Game;

public sealed class FollowCamera : MonoBehaviour
{
    public Transform? Target { get; set; }

    [SerializeField] private Vector3 offset = new(0.82f, 2.5f, -3.2f);
    [SerializeField] private float lookAhead = 2.15f;
    [SerializeField] private float smoothTime = 0.1f;

    private Vector3 velocity;
    private Vector3? inspectionOffset;
    private Vector3? inspectionLook;

    public void FrameInspection(Vector3 worldOffset, Vector3 worldLook)
    {
        inspectionOffset = worldOffset;
        inspectionLook = worldLook;
        velocity = Vector3.zero;
    }

    public void ClearInspection()
    {
        inspectionOffset = null;
        inspectionLook = null;
        velocity = Vector3.zero;
    }

    private void LateUpdate()
    {
        if (Target == null)
        {
            return;
        }

        var desired = Target.position + (inspectionOffset ?? offset);
        transform.position = Vector3.SmoothDamp(transform.position, desired, ref velocity, smoothTime);
        transform.LookAt(Target.position + Vector3.up * 0.95f + (inspectionLook ?? Vector3.forward * lookAhead));
    }
}
