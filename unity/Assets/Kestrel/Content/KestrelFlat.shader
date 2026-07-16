Shader "Kestrel/Flat"
{
    Properties
    {
        _Color ("Color", Color) = (1, 1, 1, 1)
        _Unlit ("Unlit", Range(0, 1)) = 0
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
                fixed lighting : TEXCOORD0;
            };
            fixed4 _Color;
            fixed _Unlit;

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                float3 worldNormal = UnityObjectToWorldNormal(input.normal);
                fixed directional = saturate(dot(worldNormal, normalize(float3(-0.35, 0.8, -0.45))));
                output.lighting = lerp(0.34 + directional * 0.66, 1.0, _Unlit);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                return fixed4(_Color.rgb * input.lighting, _Color.a);
            }
            ENDCG
        }
    }
    Fallback Off
}
