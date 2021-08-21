"use strict";

const { api, params } = require("@serverless/cloud"); // eslint-disable-line
// const { WebClient } = require("@slack/web-api");
const { slackSignedRequestHandler } = require("slack-secret-middleware");

const Cloud = require("./lib/cloud");

// const slack = new WebClient(params.SLACK_BOT_OAUTH_TOKEN); // TODO: post something useful to a channel
const cloud = new Cloud();

api.use(slackSignedRequestHandler(params.SLACK_BOT_SIGNING_SECRET));

const commandHandlers = {
  status,
  services,
  help,
};

async function status(args, req, res) {
  const serviceName = args[1];

  if (serviceName) {
    const instances = await cloud.listInstances({
      serviceName,
    });

    const instanceText = instances
      .map(
        (instance) =>
          `- <${instance.instanceUrl}|${instance.instanceName}> (<https://cloud.serverless.com/${params.ORG_NAME}/services/${serviceName}/instances/${instance.instanceName}|Dashboard>)`
      )
      .join("\n");

    const markdown =
      instances.length > 0
        ? `${serviceName} instances:\n${instanceText}`
        : `No instances found for service "${serviceName}"`;

    res.send({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: markdown,
          },
        },
      ],
    });
  } else {
    services(args, req, res);
  }
}

async function services(args, req, res) {
  const items = await cloud.listServices();
  const list = items
    .map(
      (item) =>
        `- <https://cloud.serverless.com/${params.ORG_NAME}/services/${item.serviceName}|${item.serviceName}>`
    )
    .join("\n");

  const markdown =
    items.length > 0 ? `Available services:\n${list}` : `No services found`;

  res.send({
    response_type: "ephemeral",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: markdown,
        },
      },
    ],
  });
}

async function help(args, req, res) {
  res.send({
    response_type: "ephemeral",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Available commands:\n```status <service-name>\nhelp\n```",
        },
      },
    ],
  });
}

api.post("/slack/commands", async (req, res) => {
  const args = req.body.text.split(" ");
  if (args.length === 0) {
  } else if (commandHandlers[args[0]]) {
    await commandHandlers[args[0]](args, req, res);
  } else {
    await help(args, req, res);
  }
});
