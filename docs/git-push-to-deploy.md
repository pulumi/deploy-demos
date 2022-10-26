# Git Push to Deploy

> **_NOTE:_**  This feature is still being actively developed, expect daily improvements and modifications. In order to try it out as a beta user you will have to go through more steps then at launch.

You can use this feature on your Pulumi individual account or in a Pulumi organization.

## GitHub App Installation

You'll need to install and configure the Pulumi GitHub App to use push-to-deploy functionality. The app requires read access to your repos so it can clone your Pulumi programs and listen to merge commits to automatically trigger deployments on `git push`.

(While the app can be installed via github.com, it is recommended to install it using the steps below to ensure everything is setup correctly.)

Follow these steps:

1. Ensure you have selected the Pulumi organization you wish to use with Pulumi Deployments in the Organization drop-down.
2. Navigate to Settings > Integrations.
3. Select the "Install the Pulumi GitHub App" button.

![gha-install](gha-install.png)

If this page says you already have the app installed, you can stop here. If the page asks you to accept additional permissions for the app, please accept the permissions and stop here.

4. After clicking "Install" you will be directed to GitHub. Select the GitHub organization you wish to use with Pulumi Deployments.
5. Select which repos (or all repos) Pulumi Deployments can have access to, and then Install.
6. You will be redirected to app.pulumi.com. Return to the Settings > Integrations tab and confirm the GitHub App is installed on your desired organization.

![gha-installed](gha-installed.png)

If you installed the GitHub app in the past and the steps above aren't showing it as installed for your desired organization, please try the following:
1. Ensure you're a GitHub admin of the GitHub organization where you're installing the app.
2. Uninstall the app (via github.com) and re-install it following the steps above.

**Note:** Uninstalling the app will delete any push-to-deploy configurations you may have already setup.

## Deployment Settings

We need your GitHub repo and branch in order to connect a stack to Pulumi Deployments. Follow these steps to get a Deployment running:

1. Navigate to a stack you want to connect to Pulumi Deployments.
2. Go to Settings > Deploy.
3. Select the GitHub Repository with source context for Pulumi to Deploy.
4. Select the branch.
5. Ensure you have the required Environment Variables to run your repository.

## Create a Deployment

You can now create a Deployment by using the Deploy Actions buttons or by pushing a commit to a GitHub pull request. If the Deploy Actions drop-down is not appearing on your stack page, try refreshing the page.

![deploy-actions](deploy-actions.png)

If you have any questions at all, please reach out in the #pulumi-deploy-beta Slack channel.
