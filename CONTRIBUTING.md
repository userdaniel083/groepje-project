## Getting stuff up and running

Alright, so I'm going to assume you've never set up a Nuxt development environment before. Nuxt? What is Nuxt? Why is Nuxt? How is Nuxt?

None of those questions will be answered, instead, we'll answer "How do you set up this projects development environment because I need to do my job for pentesting"?

### clone the repo
stating the obvious here, you know how to do this one

### oh no oh god aws.amazon.com

right.. I kinda forget to mention this one. You'll need an S3 bucket. You can *probably* use any service, like Backblaze and Cloudflare R2, but for our sake we just used Amazon AWS.

You should create a bucket that is **NOT PUBLICLY ACCESSIBLE** and get the following:
- An s3 storage bucket that is **NOT PUBLICLY ACCESSIBLE** and just a standard bucket or your usage pricing will go through the roof.
- An AWS IAM user with permission `s3:GetObject` and `s3:PutObject` on the s3 storage bucket.
- s3 retention policy set to 1 day (to expire files after 24 hours)

> [!NOTE]
> Now I understand that your job is to pentest and not to be your organization's AWS system administrator. I'll be happy to provide you with an s3 testing bucket exactly for this purpose. Please email the email address from https://prpl.wtf/contact from your organization's email address to be granted access (saves you like an hour of walking around the AWS dashboard)

Create a file called `.env` and assign stuff to the following variables:

```
S3_URL=""
S3_ENDPOINT=""
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
```

### but node.js gives me nightmares :(
too bad. let's get node.js installed.

We'll use `fnm` for this. It stands for fast node manager, maybe because it's fast or because rust developers do anything for 1ms gain in speed.

[Here are installation instructions for `fnm`](https://github.com/Schniz/fnm#installation).

After installing it, run `fnm use 24` (the LTS version).

### install dependencies

This project uses [pnpm](https://pnpm.io) to manage node modules. Why not npm? because npm sucks

```bash
npm i -g pnpm
```

ok with pnpm installed globally, install the dependencies.

> [!NOTE]
> The npm supply chain attack is an everyday story now. Why? Because npm for some reason blindly trusts extra install scripts when installing modules. pnpm does not. I've also set an option in the pnpm-workspace.yaml file that requires any package in this project to have an age of at least 24 hours, so you are pretty much safe (and also the project doesn't run on bleeding edge package versions anyways so why am I even telling you this)

now just install the packages

```bash
pnpm install
```

and we're done! just kidding, run the dev environment. if the dev environment feels slow, switch to linux.

```bash
pnpm dev
```

done.

### actually pentesting

so like the dev environment is a lot less secure because, well, it's a development environment. to get an actual idea of how to exploit it, deploy it locally as a production app.

we use nuxt for client and server.

here's a guide: https://nuxt.com/docs/4.x/getting-started/deployment

#### oh? and the s3 bucket

please for the love of god, if you're using my bucket, don't spam it with files. it costs me real money.

got it? awesome. onto breaking our lovely codebase.