var fs = require('fs');
var path = require('path');
var { exec } = require("child_process");
var arg = require('arg');
const parentModule = require('parent-module');

var exclusionsList = ['node_modules'];

function parseArgumentsIntoOptions(rawArgs) {
    var args = arg({
        '--input': String,
        '--output': String,
        '-i': '--input',
        '-o': '--output'
    }, {
        argv: rawArgs.slice(2),
    });
    return {
        inputFolder: args['--input'] || path.resolve(__dirname, 'contracts'),
        outputFolder: args['--output'] || path.resolve(__dirname, 'out')
    };
}

function cleanPath(path) {
    try {
        fs.rmdirSync(path, { recursive: true });
    } catch (e) {
    }
    try {
        fs.mkdirSync(path, { recursive: true });
    } catch (e) {
    }
}

function runProcess(processLocation, contract, outputContract) {
    var outputFolder = outputContract.split('\\').join('/');
    outputFolder = outputFolder.substring(0, outputFolder.lastIndexOf('/'));
    fs.mkdirSync(outputFolder, { recursive: true });
    return new Promise(function(ok, ko) {
        exec(`${processLocation} ${contract}`, (error, stdout) => {
            if (error) {
                return ko(error);
            }
            return ok(eraseLicenses(outputContract, `${stdout}`.trim()));
        });
    });
}

function eraseLicenses(contract, source) {
    try {
        var split = source.split('SPDX-License-Identifier:');
        var firstTranche = split[0];
        split.splice(0, 1);
        source = firstTranche + 'SPDX-License-Identifier:' + split.join('SPDX_License_Identifier:');
    } catch (e) {
        console.error(e);
    }
    fs.writeFileSync(contract, source);
}

function isValidPath(p) {
    return true;
    for(var exclusion of exclusionsList) {
        if(p.toLowerCase().indexOf(exclusion.toLowerCase()) !== -1) {
            return false;
        }
    }
}

function getContractsList(p) {
    if(!isValidPath(p)) {
        return [];
    }
    if(!fs.lstatSync(p).isDirectory()) {
        return [p];
    }
    var contracts = [];
    var files = fs.readdirSync(p);
    for (var file of files) {
        var filePath = path.resolve(p, file);
        if (fs.lstatSync(filePath).isDirectory()) {
            contracts.push(...getContractsList(filePath));
        } else if (filePath.endsWith('.sol')) {
            contracts.push(filePath);
        }
    }
    return contracts;
};

module.exports = async function main(iF, oF) {
    var wasExisting = true;
    try {
        var truffleConfigFile = path.resolve(iF ? path.dirname(parentModule()) : __dirname, 'truffle-config.js');
        wasExisting = fs.existsSync(truffleConfigFile);
        var options = parseArgumentsIntoOptions(process.argv);
        var inputFolder = iF || options.inputFolder;
        var outputFolder = oF || options.outputFolder;
        !wasExisting && fs.writeFileSync(truffleConfigFile, '');
        var processLocation = path.resolve('node_modules/.bin/truffle-flattener');
        fs.lstatSync(outputFolder).isDirectory() && cleanPath(outputFolder);
        if(fs.lstatSync(inputFolder).isDirectory()) {
            var contracts = getContractsList(inputFolder);
            await Promise.all(contracts.map(it => runProcess(processLocation, it, it.split(inputFolder).join(outputFolder))));
        } else {
            await runProcess(processLocation, inputFolder, outputFolder);
        }
    } finally {
        try {
            !wasExisting && fs.unlinkSync(truffleConfigFile);
        } catch(e) {
        }
    }
}