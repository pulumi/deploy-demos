## Git Push to Deploy

Warning: this area is still under construction. Reach out to Evan Boyle if you are a community beta user before proceeding.

## GitHub App Installation

You'll need to install and configure the [Pulumi GitHub App](https://github.com/apps/pulumi). It requires read access to your repos so it can clone pulumi programs and listent to merge commit listeneres to automatically trigger deployments on `git push`.

## Enable the Deployment Configuration UI

Navigate to app.pulumi.com and select a stack that you'd like to configure for Deploy. You'll need to open up the javascript debug console and enable the feature (this step will go away soon): 

```js
localStorage.setItem("internal-preview-enabled-465517", true);
```

Hit enter and refresh the page. Navigate to `https://app.pulumi.com/{orgOrUser}/{project}/{stack}/settings/environment` to configure your stack.

### Configuring a GitHub Repo

You will need to use the GitHub GraphQL explorer to pull your repo ID (better in-product support coming soon) 
Get your repo’s ID


https://docs.github.com/en/graphql/overview/explorer 
```
{
  repository(owner: "pulumi", name: "home") {
    databaseId
  }
}
```
