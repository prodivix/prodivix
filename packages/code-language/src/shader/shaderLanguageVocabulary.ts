import type { CodeLanguageCompletionKind } from '@prodivix/authoring';
import type { ShaderCodeLanguage } from './shaderLanguage.types';

export type ShaderVocabularyItem = Readonly<{
  label: string;
  kind: CodeLanguageCompletionKind;
  detail: string;
  documentation: string;
}>;

const words = (value: string): readonly string[] =>
  Object.freeze(value.trim().split(/\s+/u));

const createItems = (
  labels: readonly string[],
  input: Omit<ShaderVocabularyItem, 'label'>
): readonly ShaderVocabularyItem[] =>
  Object.freeze(labels.map((label) => Object.freeze({ label, ...input })));

const glslKeywords = words(`
  break buffer case centroid coherent const continue default discard do else
  flat for highp if in inout invariant layout lowp mediump noperspective out
  patch precision precise readonly restrict return sample shared smooth struct
  subroutine switch uniform varying volatile while writeonly
`);

const glslTypes = words(`
  bool bvec2 bvec3 bvec4 double dmat2 dmat3 dmat4 dmat2x3 dmat2x4 dmat3x2
  dmat3x4 dmat4x2 dmat4x3 dvec2 dvec3 dvec4 float image2D image3D imageCube
  int ivec2 ivec3 ivec4 mat2 mat3 mat4 mat2x3 mat2x4 mat3x2 mat3x4 mat4x2
  mat4x3 sampler2D sampler2DArray sampler2DShadow sampler3D samplerCube
  samplerCubeShadow uint uvec2 uvec3 uvec4 void vec2 vec3 vec4
`);

const glslBuiltins = words(`
  abs acos acosh all any asin asinh atan atanh ceil clamp cos cosh cross
  degrees determinant dFdx dFdy distance dot equal exp exp2 faceforward floor
  fract fwidth greaterThan greaterThanEqual inversesqrt length lessThan
  lessThanEqual log log2 matrixCompMult max min mix mod normalize not notEqual
  outerProduct packHalf2x16 packSnorm2x16 packSnorm4x8 packUnorm2x16
  packUnorm4x8 pow radians reflect refract round roundEven sign sin sinh
  smoothstep sqrt step tan tanh texelFetch texture textureGrad textureLod
  textureOffset textureProj transpose trunc unpackHalf2x16 unpackSnorm2x16
  unpackSnorm4x8 unpackUnorm2x16 unpackUnorm4x8 gl_FragCoord gl_FragDepth
  gl_FrontFacing gl_GlobalInvocationID gl_InstanceID gl_LocalInvocationID
  gl_LocalInvocationIndex gl_NumWorkGroups gl_PointCoord gl_PointSize
  gl_Position gl_VertexID gl_WorkGroupID gl_WorkGroupSize
`);

const wgslKeywords = words(`
  alias break case const const_assert continue continuing default diagnostic
  discard else enable false fn for if let loop override requires return struct
  switch true var while
`);

const wgslTypes = words(`
  array atomic bool f16 f32 i32 mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f
  mat3x4f mat4x2f mat4x3f mat4x4f ptr sampler sampler_comparison
  texture_1d texture_2d texture_2d_array texture_3d texture_cube
  texture_cube_array texture_depth_2d texture_depth_2d_array
  texture_depth_cube texture_depth_cube_array texture_depth_multisampled_2d
  texture_external texture_multisampled_2d texture_storage_1d
  texture_storage_2d texture_storage_2d_array texture_storage_3d u32 vec2f
  vec2h vec2i vec2u vec3f vec3h vec3i vec3u vec4f vec4h vec4i vec4u
`);

const wgslBuiltins = words(`
  abs acos acosh all any arrayLength asin asinh atan atan2 atanh atomicAdd
  atomicAnd atomicCompareExchangeWeak atomicExchange atomicLoad atomicMax
  atomicMin atomicOr atomicStore atomicSub atomicXor bitcast ceil clamp cos
  cosh countLeadingZeros countOneBits countTrailingZeros cross degrees
  determinant distance dot dpdx dpdxCoarse dpdxFine dpdy dpdyCoarse dpdyFine
  exp exp2 extractBits faceForward firstLeadingBit firstTrailingBit floor fma
  fract frexp fwidth fwidthCoarse fwidthFine insertBits inverseSqrt ldexp
  length log log2 max min mix modf normalize pack2x16float pack2x16snorm
  pack2x16unorm pack4x8snorm pack4x8unorm pow quantizeToF16 radians reflect
  refract reverseBits round saturate select sign sin sinh smoothstep sqrt step
  storageBarrier subgroupAdd subgroupAll subgroupAny subgroupBroadcast
  subgroupBroadcastFirst subgroupElect subgroupMax subgroupMin subgroupMul tan
  tanh textureDimensions textureGather textureGatherCompare textureLoad
  textureNumLayers textureNumLevels textureNumSamples textureSample
  textureSampleBias textureSampleCompare textureSampleCompareLevel
  textureSampleGrad textureSampleLevel textureStore transpose trunc
  unpack2x16float unpack2x16snorm unpack2x16unorm unpack4x8snorm
  unpack4x8unorm workgroupBarrier workgroupUniformLoad
`);

const createVocabulary = (
  language: ShaderCodeLanguage,
  keywords: readonly string[],
  types: readonly string[],
  builtins: readonly string[]
): readonly ShaderVocabularyItem[] =>
  Object.freeze([
    ...createItems(keywords, {
      kind: 'keyword',
      detail: `${language.toUpperCase()} keyword`,
      documentation: `Reserved ${language.toUpperCase()} language keyword.`,
    }),
    ...createItems(types, {
      kind: 'keyword',
      detail: `${language.toUpperCase()} built-in type`,
      documentation: `Built-in ${language.toUpperCase()} shader type.`,
    }),
    ...createItems(builtins, {
      kind: 'symbol',
      detail: `${language.toUpperCase()} built-in`,
      documentation: `Built-in ${language.toUpperCase()} shader symbol.`,
    }),
  ]);

const vocabularyByLanguage: Readonly<
  Record<ShaderCodeLanguage, readonly ShaderVocabularyItem[]>
> = Object.freeze({
  glsl: createVocabulary('glsl', glslKeywords, glslTypes, glslBuiltins),
  wgsl: createVocabulary('wgsl', wgslKeywords, wgslTypes, wgslBuiltins),
});

const vocabularyIndexByLanguage: Readonly<
  Record<ShaderCodeLanguage, ReadonlyMap<string, ShaderVocabularyItem>>
> = Object.freeze({
  glsl: new Map(vocabularyByLanguage.glsl.map((item) => [item.label, item])),
  wgsl: new Map(vocabularyByLanguage.wgsl.map((item) => [item.label, item])),
});

export const getShaderVocabulary = (
  language: ShaderCodeLanguage
): readonly ShaderVocabularyItem[] => vocabularyByLanguage[language];

export const getShaderVocabularyItem = (
  language: ShaderCodeLanguage,
  name: string
): ShaderVocabularyItem | null =>
  vocabularyIndexByLanguage[language].get(name) ?? null;

export const isReservedShaderName = (
  language: ShaderCodeLanguage,
  name: string
): boolean =>
  vocabularyIndexByLanguage[language].has(name) ||
  (language === 'glsl' && name.startsWith('gl_'));
