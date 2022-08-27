"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const org = "pulumi";
const project = "simple-resource";
const stack = "dev";
const backendURL = "http://api.pulumi.com/api";
const makePulumiAPICall = (method, urlSuffix, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `${backendURL}/${urlSuffix}`;
    const accessToken = process.env.PULUMI_ACCESS_TOKEN;
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `token ${accessToken}`
    };
    const response = yield fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
    });
    if (!response.ok) {
        let errMessage = "";
        try {
            errMessage = yield response.text();
        }
        catch (_a) { }
        throw new Error(`failed to call ${urlSuffix}: ${errMessage}`);
    }
    return yield response.json();
});
const createDeployment = () => __awaiter(void 0, void 0, void 0, function* () {
    const urlSuffix = `preview/deployments/${org}/${project}/${stack}`;
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/master",
                repoDir: "simple-resource"
            }
        },
        operationContext: {
            operation: "update",
            preRunCommands: [],
            environmentVariables: {}
        }
    };
    return yield makePulumiAPICall('POST', urlSuffix, payload);
});
const getDeploymentStatus = (deploymentID) => __awaiter(void 0, void 0, void 0, function* () {
    return yield makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}`);
});
const getDeploymentLogs = (deploymentID) => __awaiter(void 0, void 0, void 0, function* () {
    return yield makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}/logs`);
});
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const nonTerminalDeploymentStatuses = ["not-started", "accepted", "running"];
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    const deploymentResult = yield createDeployment();
    console.log(deploymentResult);
    let status = "not-started";
    while (nonTerminalDeploymentStatuses.includes(status)) {
        const deploymentStatusResult = yield getDeploymentStatus(deploymentResult.id);
        status = deploymentStatusResult.Status;
        console.log(deploymentStatusResult);
        try {
            const deploymentLogs = yield getDeploymentLogs(deploymentResult.id);
            console.log(JSON.stringify(deploymentLogs));
        }
        catch (_b) {
            // TODO: try catch block shouldn't be neccessary
            // remove after https://github.com/pulumi/pulumi-service/issues/9756 is fixed
        }
        yield delay(2000);
    }
});
run().catch(err => console.log(err));
