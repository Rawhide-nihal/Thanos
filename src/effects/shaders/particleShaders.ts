export const VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position; // normalized [0, 1] screen coords
layout(location = 1) in vec4 a_color;    // rgba
layout(location = 2) in float a_size;
layout(location = 3) in float a_alpha;

uniform vec2 u_resolution;

out vec4 v_color;

void main() {
  // Convert [0, 1] to clip space [-1, 1] with flipped Y
  vec2 clipSpace = (a_position * 2.0) - 1.0;
  clipSpace.y = -clipSpace.y;

  gl_Position = vec4(clipSpace, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = vec4(a_color.rgb, a_color.a * a_alpha);
}
`;

export const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  // Make particles round and soft at edges
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }
  
  // Soft feathering at particle boundary
  float alpha = smoothstep(0.5, 0.2, dist) * v_color.a;
  fragColor = vec4(v_color.rgb, alpha);
}
`;
