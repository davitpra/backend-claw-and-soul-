export const DEFAULT_PROMPT_TEMPLATE = `Escribe únicamente el prompt final en inglés. Sustituye [description] con una descripción detallada solo del rostro del animal en la imagen (ignora completamente la pose o el cuerpo). Usa el nombre "{{petName}}" donde dice [Name].

Describe el rostro del animal con detalle visual (color de pelo, ojos, rasgos distintivos).

Prompt base:
A [description] pet portrait in the style requested. The pet is named [Name].`;

export const DEFAULT_VISION_SYSTEM_PROMPT =
  'You are an expert prompt engineer for AI image generation models. ' +
  'Be precise, avoid speculation, and base all descriptions strictly on visible elements in the image. ' +
  'Output ONLY the final prompt text in English — no preamble, no quotes, no markdown, no explanation.';

export const DEFAULT_VISION_MAX_TOKENS = 400;
