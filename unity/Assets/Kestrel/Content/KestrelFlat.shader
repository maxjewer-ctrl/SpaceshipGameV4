Shader "Kestrel/Flat"
{
    Properties
    {
        _Color ("Color", Color) = (1, 1, 1, 1)
        _Unlit ("Unlit", Range(0, 1)) = 0
        _EmissionColor ("Emission Color", Color) = (0, 0, 0, 1)
        _Emission ("Emission", Range(0, 3)) = 0
        _Pattern ("Panel Pattern", Range(0, 2)) = 0
        _PanelScale ("Panel Scale", Range(0.25, 8)) = 1
        _Wear ("Surface Wear", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };
            struct v2f
            {
                float4 vertex : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                half3 worldNormal : TEXCOORD1;
                UNITY_FOG_COORDS(2)
            };
            fixed4 _Color;
            fixed _Unlit;
            fixed4 _EmissionColor;
            fixed _Emission;
            fixed _Pattern;
            fixed _PanelScale;
            fixed _Wear;

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.worldPosition = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                UNITY_TRANSFER_FOG(output, output.vertex);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                half3 normal = normalize(input.worldNormal);
                half3 absoluteNormal = abs(normal);
                float2 panelUv = absoluteNormal.y > max(absoluteNormal.x, absoluteNormal.z)
                    ? input.worldPosition.xz
                    : (absoluteNormal.x > absoluteNormal.z ? input.worldPosition.zy : input.worldPosition.xy);

                float2 cell = abs(frac(panelUv * _PanelScale) - 0.5);
                float seam = 1.0 - smoothstep(0.455, 0.495, max(cell.x, cell.y));
                float stripe = 0.5 + 0.5 * sin((panelUv.x + panelUv.y) * 7.0);
                float panelMask = saturate(_Pattern);
                float stripeMask = saturate(_Pattern - 1.0);
                float surface = lerp(1.0, lerp(0.72, 1.04, seam), panelMask);
                surface *= lerp(1.0, lerp(0.88, 1.0, stripe), stripeMask * 0.35);

                float grain = frac(sin(dot(input.worldPosition.xz + input.worldPosition.y, float2(12.9898, 78.233))) * 43758.5453);
                surface *= lerp(1.0, lerp(0.9, 1.04, grain), _Wear);

                half directional = saturate(dot(normal, normalize(half3(-0.35, 0.8, -0.45))));
                half backLight = saturate(dot(normal, normalize(half3(0.45, 0.25, 0.75))));
                half lighting = lerp(0.25 + directional * 0.56 + backLight * 0.19, 1.0, _Unlit);
                half rim = pow(1.0 - saturate(dot(normal, normalize(_WorldSpaceCameraPos.xyz - input.worldPosition))), 3.0);
                half3 color = _Color.rgb * surface * lighting;
                color += _Color.rgb * rim * (0.04 + _Wear * 0.08);
                color += _EmissionColor.rgb * _Emission;
                fixed4 output = fixed4(color, _Color.a);
                UNITY_APPLY_FOG(input.fogCoord, output);
                return output;
            }
            ENDCG
        }
    }
    Fallback Off
}
