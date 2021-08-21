const { params } = require("@serverless/cloud");
const Axios = require("axios");

class Cloud {
  constructor() {
    const stage = params.CLOUD_STAGE;
    const baseURL =
      stage === "prod" || stage === undefined
        ? "https://api.cloud.serverless.com"
        : `https://${stage === "dev" ? "api" : stage}.cloud.serverless-dev.com`;

    this.axios = Axios.create({ baseURL });
    this.axios.defaults.headers.common = {};
    this.axios.defaults.headers.put = {};
    this.axios.defaults.headers.Authorization = `Bearer ${params.SERVERLESS_ACCESS_KEY}`;
    this.axios.defaults.headers["Content-Type"] = "application/json";
  }

  async request({ url, method = "GET", body: data, params, headers }) {
    try {
      const res = await this.axios({
        url,
        method,
        data,
        params,
        headers,
      });
      return res.data;
    } catch (error) {
      if (error.response && error.response.data) {
        const err = new Error(error.response.data.message);
        err.statusCode =
          error.response.data.statusCode || error.response.status || null;
        err.name = error.response.data.name || null;
        throw err;
      }

      throw error;
    }
  }

  async listServices() {
    return await this.request({
      url: `/orgs/${params.ORG_NAME}/services`,
    });
  }

  async listInstances({ serviceName }) {
    return await this.request({
      url: `/orgs/${params.ORG_NAME}/services/${serviceName}/instances`,
    });
  }
}

module.exports = Cloud;
