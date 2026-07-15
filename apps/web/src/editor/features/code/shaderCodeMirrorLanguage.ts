import { StreamLanguage } from '@codemirror/language';
import { clike, shader as glslMode } from '@codemirror/legacy-modes/mode/clike';

const words = (value: string): Record<string, true> =>
  Object.fromEntries(
    value
      .trim()
      .split(/\s+/u)
      .map((word) => [word, true])
  );

const wgslMode = clike({
  name: 'wgsl',
  keywords: words(`
    alias break case const const_assert continue continuing default diagnostic
    discard else enable false fn for function if let loop override private
    read read_write requires return storage struct switch true uniform var
    while workgroup write
  `),
  types: words(`
    array atomic bool f16 f32 i32 mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f
    mat3x4f mat4x2f mat4x3f mat4x4f ptr sampler sampler_comparison
    texture_1d texture_2d texture_2d_array texture_3d texture_cube
    texture_cube_array texture_depth_2d texture_depth_2d_array
    texture_depth_cube texture_depth_cube_array texture_external
    texture_multisampled_2d texture_storage_1d texture_storage_2d
    texture_storage_2d_array texture_storage_3d u32 vec2f vec2h vec2i vec2u
    vec3f vec3h vec3i vec3u vec4f vec4h vec4i vec4u
  `),
  builtin: words(`
    abs acos all any arrayLength asin atan atan2 atomicAdd atomicLoad
    atomicStore bitcast ceil clamp cos cross degrees determinant distance dot
    dpdx dpdy exp exp2 floor fract fwidth inverseSqrt length log log2 max min
    mix normalize pow radians reflect refract select sign sin smoothstep sqrt
    step tan textureDimensions textureLoad textureSample textureSampleLevel
    textureStore transpose trunc workgroupBarrier
  `),
  blockKeywords: words('for if loop struct switch while'),
  atoms: words('true false'),
  hooks: {
    '@': (stream: { eatWhile(pattern: RegExp): void }) => {
      stream.eatWhile(/[A-Za-z0-9_]/u);
      return 'meta';
    },
  },
});

export const glslCodeMirrorLanguage = StreamLanguage.define(glslMode);
export const wgslCodeMirrorLanguage = StreamLanguage.define(wgslMode);
