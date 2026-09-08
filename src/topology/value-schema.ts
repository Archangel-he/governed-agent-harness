import { isDeepStrictEqual } from 'node:util';

export interface ValueSchema {
  type?: 'object'|'array'|'string'|'number'|'integer'|'boolean'|'null';
  properties?: Record<string,ValueSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ValueSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

export function validateSchema(schema: ValueSchema): void {
  if(!schema || typeof schema!=='object' || Array.isArray(schema)) throw new Error('Invalid schema');
  const keys=['type','properties','required','additionalProperties','items','enum','minimum','maximum','minItems','maxItems'];
  for(const key of Object.keys(schema)) if(!keys.includes(key)) throw new Error('unsupported schema keyword: '+key);
  if(schema.type!==undefined&&!['object','array','string','number','integer','boolean','null'].includes(schema.type)) throw new Error('unsupported schema type');
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.some(k=>typeof k!=='string'))) throw new Error('Invalid schema required');
  if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean') throw new Error('Invalid additionalProperties');
  if(schema.properties!==undefined) {
    if(!schema.properties||typeof schema.properties!=='object'||Array.isArray(schema.properties)) throw new Error('Invalid schema properties');
    Object.values(schema.properties).forEach(validateSchema);
  }
  if(schema.items!==undefined) validateSchema(schema.items);
  if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||!schema.enum.length)) throw new Error('Invalid schema enum');
  for(const key of ['minimum','maximum','minItems','maxItems'] as const) if(schema[key]!==undefined&&!Number.isFinite(schema[key])) throw new Error('Invalid schema bound');
}

export function checkValue(value: unknown,schema?:ValueSchema,path='value'):void {
  if(!schema)return;
  const type=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(schema.type && type!==schema.type && !(schema.type==='integer'&&typeof value==='number'&&Number.isInteger(value))) throw new Error(`schema mismatch at ${path}: expected ${schema.type}`);
  if(schema.enum&&!schema.enum.some(item=>isDeepStrictEqual(item,value))) throw new Error('schema enum mismatch: '+path);
  if(typeof value==='number'&&(!Number.isFinite(value)||(schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum))) throw new Error('schema number bound: '+path);
  if(Array.isArray(value)) {
    if((schema.minItems!==undefined&&value.length<schema.minItems)||(schema.maxItems!==undefined&&value.length>schema.maxItems)) throw new Error('schema array bound: '+path);
    if(schema.items) value.forEach((item,i)=>checkValue(item,schema.items,`${path}[${i}]`));
  } else if(value!==null&&typeof value==='object') {
    const record=value as Record<string,unknown>;
    for(const key of schema.required??[]) if(!Object.hasOwn(record,key)) throw new Error('schema missing required: '+path+'.'+key);
    for(const [key,item] of Object.entries(record)) {
      if(schema.additionalProperties===false&&!Object.hasOwn(schema.properties??{},key)) throw new Error('schema additional property: '+path+'.'+key);
      checkValue(item,schema.properties?.[key],path+'.'+key);
    }
  }
}
