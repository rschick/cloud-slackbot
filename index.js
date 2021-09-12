const { api, data, params, schedule } = require("@serverless/cloud"); // eslint-disable-line
const { WebClient } = require("@slack/web-api");
const { slackSignedRequestHandler } = require("slack-secret-middleware");
const ksuid = require("ksuid");
const axios = require("axios");

const Cloud = require("./lib/cloud");

const slack = new WebClient(params.SLACK_BOT_OAUTH_TOKEN);

api.use(slackSignedRequestHandler(params.SLACK_BOT_SIGNING_SECRET));

const commandHandlers = {
  status,
  config,
  help,
};

async function status(args, command, { cloud }) {
  const { response_url } = command;

  const services = await cloud.listServices();
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Your organization "${cloud.org}" has ${
          services.length || "no"
        } services`,
      },
    },
  ];

  for (const service of services) {
    const instances = await cloud.listInstances(service);
    const { serviceName } = service;

    const instanceText = instances
      .map(
        ({ instanceName, instanceUrl }) =>
          `• <${instanceUrl}|${instanceName}> (<https://cloud.serverless.com/${params.ORG_NAME}/services/${serviceName}/instances/${instanceName}|view in dashboard>)`
      )
      .join("\n");

    const serviceText = `<https://cloud.serverless.com/${params.ORG_NAME}/services/${serviceName}|${serviceName}>`;
    const markdown =
      instances.length > 0
        ? `${serviceText} instances:\n${instanceText}`
        : `${serviceText} (no instances)`;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: markdown,
      },
    });
  }

  await axios.post(response_url, { replace_original: "true", blocks });
}

async function help(args, { response_url }) {
  await axios.post(response_url, {
    replace_original: "true",
    text: [
      "Available commands:",
      "• `config org <org_name>`: configure your organization name",
      "• `config key <access_key>`: configure your access key",
      "• `status`: display the status of your services",
      "• `help`: display this message",
    ].join("\n"),
  });
}

async function config(args, { response_url, user_id }) {
  if (!["org", "key"].includes(args[1])) {
    await axios.post(response_url, {
      replace_original: "true",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Invalid command",
          },
        },
      ],
    });

    return help(args, { response_url });
  }
  await data.set(`user_${user_id}`, {
    [args[1]]: args[2],
  });
  await axios.post(response_url, {
    replace_original: "true",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Successfully updated \`${args[1]}\``,
        },
      },
    ],
  });
}

api.post("/slack/commands", async (req, res) => {
  const commandId = (await ksuid.random()).string;
  await data.set(`command_${commandId}`, req.body);
  res.status(200).end();
});

data.on("created:command_*", async ({ item }) => {
  const command = item.value;

  const user = await data.set(
    `user_${command.user_id}`,
    {
      user_id: command.user_id,
    },
    {
      label1: `users:user_${command.user_id}`,
    }
  );

  const context = {
    user,
    cloud: new Cloud(user),
  };

  try {
    const args = command.text.split(" ").filter((x) => x);
    if (args.length === 0) {
      await status(args, command, context);
    } else if (commandHandlers[args[0]]) {
      await commandHandlers[args[0]](args, command, context);
    } else {
      await help(args, command, context);
    }
  } catch (error) {
    console.log(error);
    await axios.post(command.response_url, {
      replace_original: "true",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              "Oops, I couldn't connect to your Cloud account.",
              "You may need to configure your org and key using:",
              "1. `/cloud config org <org_name>`",
              "2. `/cloud config key < access_key > `",
            ].join("\n"),
          },
        },
      ],
    });
  } finally {
    await data.remove(item.key);
  }
});

schedule.every("1 hour", async () => {
  const { items: users } = await data.getByLabel("label1", "users:user_*");

  for (const { value: user } of users) {
    const result = await slack.chat.postMessage({
      text: "Hello world!",
      channel: user.user_id,
    });

    console.log(JSON.stringify(result, null, 2));
  }
});
