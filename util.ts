// Copyright 2016-2019, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { CustomResourceOptions } from "@pulumi/pulumi";

export function bindToRole(
  name: string,
  sa: gcp.serviceaccount.Account,
  args: { project: pulumi.Input<string>; roles: pulumi.Input<string>[] },
  opts?: CustomResourceOptions
) {
  args.roles.forEach((role, index) => {
    new gcp.projects.IAMBinding(
      `${name}-${index}`,
      {
        project: args.project,
        role,
        members: [sa.email.apply((email) => `serviceAccount:${email}`)],
      },
      opts
    );
  });
}

export function createServiceAccountKey(
  name: string,
  serviceAccount: gcp.serviceaccount.Account,
  opts?: CustomResourceOptions
): gcp.serviceaccount.Key {
  return new gcp.serviceaccount.Key(
    name,
    {
      serviceAccountId: serviceAccount.name,
      publicKeyType: "TYPE_X509_PEM_FILE",
    },
    opts
  );
}

export function clientSecret(key: gcp.serviceaccount.Key): pulumi.Output<any> {
  return key.privateKey.apply((key) =>
    Buffer.from(key, "base64").toString("utf8")
  );
}
