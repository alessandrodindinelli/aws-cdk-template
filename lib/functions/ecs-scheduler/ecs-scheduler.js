const { ECSClient, UpdateServiceCommand } = require("@aws-sdk/client-ecs");

exports.handler = async function (event) {
	console.log("\n##### EXECUTING LAMBDA FUNCTION #####\n");

	const region = process.env.region;
	const clusterName = process.env.clusterName;
	const services = process.env.services.split(",");
	const desiredCount = parseInt(process.env.desiredCount);

	const client = new ECSClient({ region: region });

	for (let i = 0; i < services.length; i++) {
		console.log("\n##### STARTING SERVICE " + services[i] + " #####\n");

		const params = {
			cluster: clusterName,
			service: services[i],
			desiredCount: desiredCount,
		};
		await client.send(new UpdateServiceCommand(params));
	}

	console.log("\n##### EXITING LAMBDA FUNCTION #####\n");
};
