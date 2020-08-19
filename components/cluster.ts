import * as pulumi from "@pulumi/pulumi";

import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

import { ComponentResource, CustomResourceOptions } from "@pulumi/pulumi";

export class Cluster extends ComponentResource {
  provider: k8s.Provider;

  constructor(
    name: string,
    location: string,
    opts: CustomResourceOptions = {}
  ) {
    super("taskforce:provisioner:Cluster", name, {}, opts);

    const engineVersion = gcp.container
      .getEngineVersions({ location })
      .then((v) => v.latestMasterVersion);

    const cluster = new gcp.container.Cluster(
      name,
      {
        location,
        initialNodeCount: 1,
        minMasterVersion: engineVersion,
        nodeVersion: engineVersion,
        removeDefaultNodePool: true,
      },
      { parent: this }
    );

    const nodePool = new gcp.container.NodePool(
      "nodes",
      {
        location,
        cluster: cluster.name,
        nodeCount: 1,
        autoscaling: {
          maxNodeCount: 25,
          minNodeCount: 1,
        },
        nodeConfig: {
          machineType: "n1-standard-1",
          diskType: "pd-ssd",
          oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
            "https://www.googleapis.com/auth/ndev.clouddns.readwrite",

            "https://www.googleapis.com/auth/service.management.readonly",
            "https://www.googleapis.com/auth/trace.append",
            "https://www.googleapis.com/auth/servicecontrol",
          ],
        },
      },
  //    { parent: this }
    );

    const kubeconfig = pulumi
      .all([cluster.name, cluster.endpoint, cluster.masterAuth])
      .apply(([name, endpoint, masterAuth]) => {
        const context = `${gcp.config.project}_${location}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
      });

    // Create a Kubernetes provider instance that uses our cluster from above.
    this.provider = new k8s.Provider(
      name,
      {
        kubeconfig,
      },
      { parent: this }
    );

    // Create a limited role for the `pulumi:devs` to use in the apps namespace.
    let devsGroupRole = new k8s.rbac.v1.Role(
      "pulumi-devs",
      {
        // metadata: { namespace: appNamespaceName },
        rules: [
          {
            apiGroups: [""],
            resources: [
              "pods",
              "secrets",
              "services",
              "persistentvolumeclaims",
            ],
            verbs: ["get", "list", "watch", "create", "update", "delete"],
          },
          {
            apiGroups: ["extensions", "apps"],
            resources: ["replicasets", "deployments"],
            verbs: ["get", "list", "watch", "create", "update", "delete"],
          },
        ],
      },
      { provider: this.provider, parent: this }
    );

    // Bind the `pulumi:devs` RBAC group to the new, limited role.
    let devsGroupRoleBinding = new k8s.rbac.v1.RoleBinding(
      "pulumi-devs",
      {
        // metadata: { namespace: appNamespaceName },
        subjects: [
          {
            kind: "Group",
            name: "pulumi:devs",
          },
        ],
        roleRef: {
          kind: "Role",
          name: devsGroupRole.metadata.name,
          apiGroup: "rbac.authorization.k8s.io",
        },
      },
      { provider: this.provider, parent: this }
    );

    this.registerOutputs({
      provider: this.provider,
    });
  }
}
