#!/usr/bin/env node

// this tool requires async/await, and therefore Node.js 8.3+

'use strict';

const fs = require('fs');

const yaml = require('yaml');
const fetch = require('node-fetch-h2');
const bae = require('better-ajv-errors');

const swagger2openapi = require('./index.js');
const validator = require('oas-validator');

process.exitCode = 1;

let argv = require('yargs')
    .boolean('all')
    .alias('a','all')
    .describe('all','show all lint warnings')
    .boolean('bae')
    .alias('b','bae')
    .describe('bae','enable better-ajv-errors')
    .string('encoding')
    .alias('e','encoding')
    .default('encoding','utf8')
    .describe('encoding','text encoding to use')
    .boolean('force')
    .alias('f','force')
    .describe('force','output even if validation/lint failures')
    .boolean('internal')
    .alias('i','internal')
    .describe('internal','resolve internal $refs also')
    .boolean('json')
    .alias('j','json')
    .describe('json','output validation/lint errors in JSON format')
    .boolean('lint')
    .describe('lint','also lint the document')
    .alias('l','lint')
    .array('lintSkip')
    .describe('lintSkip','linter rule name(s) to skip')
    .alias('s','lintSkip')
    .boolean('dumpMeta')
    .alias('m','dumpMeta')
    .describe('dumpMeta','Dump definition metadata')
    .string('output')
    .alias('o','output')
    .describe('output','outfile file to write to, default STDOUT')
    .boolean('prevalidate')
    .alias('p','prevalidate')
    .describe('prevalidate','validate $ref\'d files separately')
    .count('quiet')
    .alias('q','quiet')
    .describe('quiet','reduce verbosity')
    .count('verbose')
    .default('verbose',1)
    .alias('v','verbose')
    .describe('verbose','increase verbosity')
    .demand(1)
    .argv;

function main(){
    return new Promise(async function(resolve,reject){
        const ruleUrls = new Set();
        argv.resolve = true;
        argv.patch = true;
        argv.source = argv._[0];
        if (argv.all) argv.lintLimit = Number.MAX_SAFE_INTEGER;
        if (argv.bae) {
            argv.validateSchema = 'first';
            argv.prettify = true;
        }
        if (argv.internal) {
            argv.resolveInternal = true;
        }
        let options = {};
        let result = false;
        let jsonOutput = {};
        try {
          if (argv.source.startsWith('http')) {
              options = await swagger2openapi.convertUrl(argv.source,argv);
          }
          else {
              options = await swagger2openapi.convertFile(argv.source,argv);
          }
          result = await validator.validateSync(options.openapi,options);
        }
        catch (ex) {
            let path;
            if (options.context) {
                path = options.context.pop();
            }
            if (options.json) {
                jsonOutput.error = ex.message;
                if (options.verbose > 1) jsonOutput.stacktrace = ex.stack;
                if (path) {
                    jsonOutput.path = path;
                }
            }
            else {
                console.warn(ex.message);
                if (options.verbose > 1) console.warn(ex.stack);
                if (path) {
                    console.warn(path);
                }
            }
            jsonOutput.warnings = [];
            if (options.warnings) {
                for (let warning of options.warnings) {
                    if (argv.bae) {
                        const display = bae(options.schema,options.openapi,[warning]);
                        console.warn(display);
                    }
                    else if (options.json) {
                        jsonOutput.warnings.push({ message:warning.message, pointer:warning.pointer, ruleName:warning.ruleName, ruleUrl:warning.ruleUrl });
                    }
                    else {
                        console.warn(warning.message,warning.pointer,warning.ruleName);
                        if (warning.rule.url) ruleUrls.add(warning.rule.url+'#'+warning.ruleName);
                    }
                }
            }
            reject(ex);
        }
        if ((ruleUrls.size > 0) && (!options.json)) {
            console.warn('For more information, visit:');
            for (let url of ruleUrls) {
                console.warn(url);
            }
        }
        if (argv.dumpMeta) {
            if (options.json) {
                jsonOutput.metadata = options.metadata;
            }
            else {
                console.warn('\n#Definition metadata:');
                console.warn(yaml.stringify(options.metadata,{depth:Math.INFINITY}));
            }
        }
        if (options.json) {
            console.warn(JSON.stringify(jsonOutput, null, 2));
        }
        if (result || argv.force) {
            if (options.output) {
                if (options.sourceYaml) {
                    fs.writeFileSync(options.output, yaml.stringify(options.openapi),options.encoding);
                }
                else {
                    fs.writeFileSync(options.output, JSON.stringify(options.openapi,null,2),options.encoding);
                }
            }
            else {
                if (options.sourceYaml) {
                    console.log(yaml.stringify(options.openapi));
                }
                else {
                    console.log(JSON.stringify(options.openapi,null,2));
                }
            }
        }
        resolve(options.openapi);
    });
}

main()
.then(function(options){
    process.exitCode = 0;
})
.catch(function(err){
    if (!argv.json) console.warn(err.message);
});

