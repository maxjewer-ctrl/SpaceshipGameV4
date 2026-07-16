using UnityEngine;

namespace Kestrel.Game;

public sealed class FollowCamera : MonoBehaviour
{
    public Transform? Target { get; set; }

    [SerializeField] private Vector3 offset = new(0f, 3.1f, -5.2f);
    [SerializeField] private float smoothTime = 0.08f;

    private Vector3 velocity;

    private void LateUpdate()
    {
        if (Target == null)
        {
            return;
        }

        var desired = Target.position + offset;
        transform.position = Vector3.SmoothDamp(transform.position, desired, ref velocity, smoothTime);
        transform.LookAt(Target.position + Vector3.up * 1.2f);
    }
}
