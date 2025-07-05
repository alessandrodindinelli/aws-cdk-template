# CDK Template

> **Disclaimer**: This repository was written and tested to be used in the future, as a possible reference, if needed. I can't ensure that the code will continue to work as intended with future updates to the tools used. Enjoy 🤓

## Introduction

The idea behind this project is to keep a boilerplate repository that I could reference in case I'd need to reuse CDK in the future to provision Infrastructure as Code (IaC) on AWS.
It isn't very complex, and there isn't any application running on the infrastructure itself, it's just a basic setup of the account with some useful configurations.
I've decided to use TypeScript, even though you could use Python, Java, or other languages, simply because it was the language I was most fluent in during my software development past.

## Requirements

The following are the versions of the various tools used:

- NodeJS - 22.14.0
- NPM - 11.1.0
- CDK - 2.1013.0

Also, before deploying this CDK code, remember to bootstrap the AWS region you want to target, as well as us-east-1, since we'll definitely be deploying the Budget and the WAF in that region.
The command to bootstrap a particular AWS region is the following:

```bash
cdk bootstrap AWS_ACCOUNT_ID/AWS_REGION
```

Run this command outside of the repository folder, otherwise you'll receive an error because for all CDK related commands inside the project there is a check to specify which environment to target.

## Commands

To facilitate the interaction with the CDK stacks, I've prepared some NPM scripts you can use.
They're located in the _package.json_, to execute them run `npm run COMMAND_NAME`, with one of these command names:

- `cdk-diff-dev`: This will run a diff check for all stacks declared in the /bin/app.ts file.
  - This script will execute the following command: `cdk context --clear && cdk diff -c config=dev`
- `cdk-deploy-dev`: This will trigger the deploy of all stacks declared in the /bin/app.ts file without asking for permission for each action.
  - This script will execute the following command: `cdk context --clear && cdk deploy --all -c config=dev --require-approval never`
- `cdk-destroy-dev`: This will trigger the destruction of all stacks declared in the /bin/app.ts file without asking for permission for each action.
  - This script will execute the following command: `cdk destroy --all --force -c config=dev`

## Code

In the following paragraphs I'll try to explain quickly the main points for the most important files:

### Bin

- **app.ts**: Here we declare all of the CloudFormation stacks we want to manage with this project and their own dependencies. The _buildConfig_ object will be a 1:1 copy of the _cdk.json_ file, specifically the _context_ field based on how we map it in _/lib/config/build-config.ts_. Using this approach, we can use the same code for all environments (e.g. dev, staging, prod) and only change the values we specify in the _cdk.json_. It can be a bit of work to map all data types, but that's also an advantage of using Typescript in my opinion, since the data types protect us from many human errors.

### Lib

- **cdk.json**: Here you can see inside the _context_ field a _dev_, _staging_ and _prod_ objects just as examples. The idea is that you can edit their configurations without touching the codebase, to replicate each environment with its own specific values.
- **build-config.ts**: As said, here we map 1:1 the _context_ field of the _cdk.json_ file. We also use a _getConfig()_ function to ensure the user specifies which environment they want to manage with each CDK command.
- **cloudfront.ts**: This is a simple S3 + CloudFront setup to be used as webapp for example. This imports the WAF stack to use the rules specified there.
- **cloudwatch-alarms.ts**: Here we create alarms for all ECS services and the Target Groups, grouped them into composite alarms and also create a Dashboard to have a centralized view.
- **ecs-scheduler.ts**: To avoid paying for the ECS services during the night on the development environments I usually plan a scheduler to set all services to 0 tasks in the evening, and reschedule them in the morning. The Lambda code is very simple, and it uses the JavaScript SDK.
- **ecs**: This is the biggest file, here we create an Application Load Balancer to expose our microservices running on ECS. To create them we cycle through the array specified on the _cdk.json_ file so it's very easy to add new ones in the future without touching the code. Also I've set up the permissions and configuration to use ECS Exec, which is basically Docker Exec since we're running on Fargate and we don't have access to the underlying EC2 instance.
- **network.ts**: The networking setup is pretty simple, with 2 Availability Zones and 1 NAT. An improvement could be to add a condition so that in the Production environment it could create a second NAT for high availability.
- **security-groups**: Even though in this case I could have avoided using a different file to declare the Security Groups, I've found this to be a good approach when for example you're also using an RDS database or some EC2 and you want to reference each Security Group without incurring in a circular reference.
- **waf.ts**: This is a simple Firewall with predefined blacklist and whitelist IP lists and a bunch of AWS Managed Rules. At the moment of writing the logging for the WAF can be enabled only through the AWS Console, so here I only create the Log Group and a logging filter.
