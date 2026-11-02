/**
 * @fileoverview CSS plugin.
 * @author Nicholas C. Zakas
 */
import { CSSLanguage } from "./languages/css-language.js";
import { CSSSourceCode } from "./languages/css-source-code.js";
declare const plugin: {
    meta: {
        name: string;
        namespace: string;
        version: string;
    };
    languages: {
        css: CSSLanguage;
    };
    rules: {
        "font-family-fallbacks": {
            meta: {
                type: "suggestion";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    useFallbackFonts: string;
                    useGenericFont: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-duplicate-imports": {
            meta: {
                type: "problem";
                languages: string[];
                fixable: "code";
                hasSuggestions: true;
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    duplicateImport: string;
                    removeDuplicateImportWithModifiers: string;
                    removeDuplicateImportWithoutModifiers: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-duplicate-keyframe-selectors": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    duplicateKeyframeSelector: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-empty-blocks": {
            meta: {
                type: "problem";
                languages: string[];
                hasSuggestions: true;
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    emptyBlock: string;
                    removeRule: string;
                    convertToStatement: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-important": {
            meta: {
                type: "problem";
                languages: string[];
                hasSuggestions: true;
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    unexpectedImportant: string;
                    removeImportant: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-invalid-at-rule-placement": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    invalidCharsetPlacement: string;
                    invalidImportPlacement: string;
                    invalidNamespacePlacement: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-invalid-at-rules": {
            meta: {
                type: "problem";
                languages: string[];
                fixable: "code";
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    unknownAtRule: string;
                    invalidPrelude: string;
                    unknownDescriptor: string;
                    invalidDescriptor: string;
                    invalidExtraPrelude: string;
                    missingPrelude: string;
                    invalidCharsetSyntax: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-invalid-named-grid-areas": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    emptyGridArea: string;
                    unevenGridArea: string;
                    nonRectangularGridArea: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-invalid-properties": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        allowUnknownVariables: {
                            type: "boolean";
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    allowUnknownVariables: false;
                }];
                messages: {
                    invalidPropertyValue: string;
                    unknownProperty: string;
                    unknownVar: string;
                };
            };
            create: (context: unknown) => any;
        };
        "no-unmatchable-selectors": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                messages: {
                    unmatchableSelector: string;
                };
            };
            create: (context: unknown) => any;
        };
        "prefer-logical-properties": {
            meta: {
                type: "problem";
                languages: string[];
                hasSuggestions: true;
                docs: {
                    description: string;
                    dialects: string[];
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        allowProperties: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowUnits: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    allowProperties: any[];
                    allowUnits: any[];
                }];
                messages: {
                    notLogicalProperty: string;
                    notLogicalValue: string;
                    notLogicalUnit: string;
                    replaceWithLogicalProperty: string;
                    replaceWithLogicalValue: string;
                    replaceWithLogicalUnit: string;
                };
            };
            create: (context: unknown) => any;
        };
        "relative-font-units": {
            meta: {
                type: "suggestion";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        allowUnits: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    allowUnits: string[];
                }];
                messages: {
                    allowedFontUnits: string;
                };
            };
            create: (context: unknown) => any;
        };
        "selector-complexity": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        maxIds: {
                            type: "integer";
                            minimum: number;
                        };
                        maxClasses: {
                            type: "integer";
                            minimum: number;
                        };
                        maxTypes: {
                            type: "integer";
                            minimum: number;
                        };
                        maxAttributes: {
                            type: "integer";
                            minimum: number;
                        };
                        maxPseudoClasses: {
                            type: "integer";
                            minimum: number;
                        };
                        maxUniversals: {
                            type: "integer";
                            minimum: number;
                        };
                        maxCompounds: {
                            type: "integer";
                            minimum: number;
                        };
                        maxCombinators: {
                            type: "integer";
                            minimum: number;
                        };
                        disallowCombinators: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                            uniqueItems: true;
                        };
                        disallowPseudoClasses: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                            uniqueItems: true;
                        };
                        disallowPseudoElements: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                            uniqueItems: true;
                        };
                        disallowAttributes: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                            uniqueItems: true;
                        };
                        disallowAttributeMatchers: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                            uniqueItems: true;
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    maxIds: number;
                    maxClasses: number;
                    maxTypes: number;
                    maxAttributes: number;
                    maxPseudoClasses: number;
                    maxUniversals: number;
                    maxCompounds: number;
                    maxCombinators: number;
                    disallowCombinators: any[];
                    disallowPseudoClasses: any[];
                    disallowPseudoElements: any[];
                    disallowAttributes: any[];
                    disallowAttributeMatchers: any[];
                }];
                messages: {
                    maxSelectors: string;
                    disallowedSelectors: string;
                };
            };
            create: (context: unknown) => any;
        };
        "use-baseline": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    recommended: boolean;
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        available: {
                            anyOf: ({
                                enum: string[];
                                type?: undefined;
                                minimum?: undefined;
                                maximum?: undefined;
                            } | {
                                enum?: undefined;
                                type: "integer";
                                minimum: number;
                                maximum: number;
                            })[];
                        };
                        allowAtRules: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowFunctions: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowMediaConditions: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowProperties: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowPropertyValues: {
                            type: "object";
                            properties: {
                                [k: string]: {
                                    type: "array";
                                    items: {
                                        enum: string[];
                                    };
                                    uniqueItems: true;
                                };
                            };
                            additionalProperties: false;
                        };
                        allowSelectors: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                        allowUnits: {
                            type: "array";
                            items: {
                                enum: string[];
                            };
                            uniqueItems: true;
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    available: "widely";
                    allowAtRules: any[];
                    allowFunctions: any[];
                    allowMediaConditions: any[];
                    allowProperties: any[];
                    allowPropertyValues: {};
                    allowSelectors: any[];
                    allowUnits: any[];
                }];
                messages: {
                    notBaselineProperty: string;
                    notBaselinePropertyValue: string;
                    notBaselineAtRule: string;
                    notBaselineFunction: string;
                    notBaselineMediaCondition: string;
                    notBaselineSelector: string;
                    notBaselineUnit: string;
                };
            };
            create: (context: unknown) => any;
        };
        "use-layers": {
            meta: {
                type: "problem";
                languages: string[];
                docs: {
                    description: string;
                    dialects: string[];
                    url: string;
                };
                schema: {
                    type: "object";
                    properties: {
                        allowUnnamedLayers: {
                            type: "boolean";
                        };
                        requireImportLayers: {
                            type: "boolean";
                        };
                        layerNamePattern: {
                            type: "string";
                        };
                    };
                    additionalProperties: false;
                }[];
                defaultOptions: [{
                    allowUnnamedLayers: false;
                    requireImportLayers: true;
                    layerNamePattern: string;
                }];
                messages: {
                    missingLayer: string;
                    missingLayerName: string;
                    missingImportLayer: string;
                    layerNameMismatch: string;
                };
            };
            create: (context: unknown) => any;
        };
    };
    configs: {
        recommended: {
            name: string;
            plugins: {};
            rules: {
                readonly "css/font-family-fallbacks": "error";
                readonly "css/no-duplicate-imports": "error";
                readonly "css/no-duplicate-keyframe-selectors": "error";
                readonly "css/no-empty-blocks": "error";
                readonly "css/no-important": "error";
                readonly "css/no-invalid-at-rule-placement": "error";
                readonly "css/no-invalid-at-rules": "error";
                readonly "css/no-invalid-named-grid-areas": "error";
                readonly "css/no-invalid-properties": "error";
                readonly "css/no-unmatchable-selectors": "error";
                readonly "css/use-baseline": "error";
            };
        };
    };
};
export default plugin;
export { CSSSourceCode };
export * from "./languages/css-language.js";
export * from "./types.js";
