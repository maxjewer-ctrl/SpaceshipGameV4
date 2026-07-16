using UnityEngine;

namespace Kestrel.Game;

[RequireComponent(typeof(CharacterController))]
public sealed class KestrelPlayerController : MonoBehaviour
{
    private static readonly int MovingParameter = Animator.StringToHash("Moving");

    [SerializeField] private float walkSpeed = 4.2f;
    [SerializeField] private float sprintSpeed = 6.4f;
    [SerializeField] private float turnSpeed = 540f;

    private CharacterController? controller;
    private Animator? visualAnimator;
    private Vector3 velocity;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
        controller.radius = 0.35f;
        controller.height = 1.8f;
        controller.center = new Vector3(0f, 0.9f, 0f);
    }

    private void Update()
    {
        var x = Input.GetAxisRaw("Horizontal");
        var z = Input.GetAxisRaw("Vertical");
        var move = new Vector3(x, 0f, z);
        if (move.sqrMagnitude > 1f)
        {
            move.Normalize();
        }

        var speed = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift) ? sprintSpeed : walkSpeed;
        if (move.sqrMagnitude > 0.001f)
        {
            transform.rotation = Quaternion.RotateTowards(
                transform.rotation,
                Quaternion.LookRotation(move),
                turnSpeed * Time.deltaTime);
        }

        if (visualAnimator != null)
        {
            visualAnimator.SetBool(MovingParameter, move.sqrMagnitude > 0.001f);
        }

        velocity.y += Physics.gravity.y * Time.deltaTime;
        if (controller != null && controller.isGrounded && velocity.y < 0f)
        {
            velocity.y = -1f;
        }

        controller?.Move((move * speed + velocity) * Time.deltaTime);
    }

    public void SetVisualAnimator(Animator? animator)
    {
        visualAnimator = animator;
        if (visualAnimator != null) visualAnimator.SetBool(MovingParameter, false);
    }

    public void Teleport(Vector3 position)
    {
        if (controller == null)
        {
            controller = GetComponent<CharacterController>();
        }

        controller.enabled = false;
        transform.position = position;
        velocity = Vector3.zero;
        controller.enabled = true;
    }
}
