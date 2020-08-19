import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

import { ExternalDns } from "./components/external-dns";
import { Cluster } from "./components/cluster";

const name = "provisioner";
const location = "europe-north1";

const cluster = new Cluster(`cluster-${name}`, location);

const externalDns = new ExternalDns(`my-external-dns`, location, cluster.provider);
