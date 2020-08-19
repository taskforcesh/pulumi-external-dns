import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

import * as config from "../config";
import * as util from "../util";
import {
  ProviderResource,
  ComponentResource,
  CustomResourceOptions,
} from "@pulumi/pulumi";

export class ExternalDns extends ComponentResource {
  constructor(
    name: string,
    location: string,
    provider: ProviderResource,
    opts: CustomResourceOptions = {}
  ) {
    super("taskforce:provisioner:external-dns", name, {}, opts);

    const dnsName = `*.${location}.taskforce.run.`;

    /*

    const provisionsZone = new gcp.dns.ManagedZone(
      "taskforce-zone-provisions",
      {
        description: "DNS zone for redis provisions",
        dnsName,
        labels: {},
      },
      { parent: this }
    );
*/
    const serviceAccount = new gcp.serviceaccount.Account(
      "externalDnsServiceAccount",
      {
        project: config.project,
        accountId: `${name}-external-dns`,
        displayName: `External DNS service account for ${name}`,
      },
      { parent: this }
    );

    // Bind the admin ServiceAccount to be a GKE cluster admin.
    util.bindToRole(
      `${name}-external-dns-bind`,
      serviceAccount,
      {
        project: config.project,
        roles: ["roles/dns.admin"],
      },
      { parent: serviceAccount }
    );

    const serviceAccountKey = util.createServiceAccountKey(
      "externalDnsServiceAccountKey",
      serviceAccount,
      { parent: serviceAccount, additionalSecretOutputs: ["privateKey"] }
    );

    const serviceAccountKeySecret = util.clientSecret(serviceAccountKey);

    const serviceAccountSecret = new k8s.core.v1.Secret(
      "external-dns-secret",
      {
        type: "Opaque",
        stringData: {
          "credentials.json": serviceAccountKey.privateKey.apply((x) =>
            Buffer.from(x, "base64").toString("utf8")
          ),
        },
      },
      { provider, parent: serviceAccount }
    );

    const externalDns = new k8s.helm.v3.Chart(
      "external-dns",
      {
        repo: "bitnami",
        chart: "external-dns",
        // version: "2.21.2",
        values: {
          provider: "google",
          google: {
            project: config.project,
            serviceAccountSecret: serviceAccountSecret.id,
            // serviceAccountSecretKey: "credentials.json",
            // serviceAccountKey: serviceAccountKey.id,
          },
          serviceAccountKeySecret: {
            create: false,
            name: serviceAccountKey.id,
          },
          policy: "sync",
          registry: "txt",
          txtOwnerId: "k8s",
          domainFilters: [dnsName],
          /*
          rbac: {
            create: true,
            apiVersion: "v1",
          },
          */
        },
      },
      {
        provider,
        parent: this,
        dependsOn: [serviceAccountKey, serviceAccountSecret],
      }
    );
  }
}
