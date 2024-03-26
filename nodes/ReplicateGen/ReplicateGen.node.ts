import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-core';

import {
	IDataObject,
	INodeExecutionData,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
} from 'n8n-workflow';

import { ReplicateProperties } from './ReplicateGen.types';

export class ReplicateGen implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Replicate',
		name: 'ReplicateGen',
		icon: 'file:replicate.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Replicate API',
		defaults: {
			name: 'Replicate',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'replicateApi',
				required: true,
			},
		],
		// Basic node details will go here
		properties: [
			// Resources and operations will go here
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Model',
						value: 'model',
					},
				],
				default: 'model',
				noDataExpression: true,
				required: true,
				description: 'Use Replicate API',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['model'],
					},
				},
				options: [
					{
						name: 'Run Prediction',
						value: 'prediction',
						description: 'Run a prediction',
						action: 'Run a prediction',
					},
				],
				default: 'prediction',
				noDataExpression: true,
			},
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['prediction'],
					},
				},
				default: '',
				placeholder: 'account/model-name',
				description: 'Name of the model to run',
			},
			{
				displayName: 'Model Version',
				name: 'modelVersion',
				required: true,
				type: 'resourceLocator',
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['prediction'],
					},
				},
				default: { mode: 'list', value: '' },
				modes: [
					{
						displayName: 'Version',
						name: 'list',
						type: 'list',
						placeholder: 'Select a version...',
						typeOptions: {
							searchListMethod: 'getModelVersions',
							searchable: true,
						},
					},
				],
				description: 'Version of the model to run',
			},
			{
				displayName: 'Properties',
				name: 'properties',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Property',
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['prediction'],
					},
				},
				options: [
					{
						name: 'propertyValues',
						displayName: 'Property',
						values: [
							{
								displayName: 'Key Name or ID',
								name: 'key',
								type: 'options',
								description:
									'Choose from the list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
								typeOptions: {
									loadOptionsMethod: 'getModelProperties',
									loadOptionsDependsOn: ['modelName', 'modelVersion'],
								},
								default: '',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'hidden',
								default: '={{$parameter["&key"].split("|")[1]}}',
							},
							{
								displayName: 'Boolean',
								name: 'booleanValue',
								displayOptions: {
									show: {
										type: ['boolean'],
									},
								},
								type: 'boolean',
								default: false,
							},
							{
								displayName: 'Number',
								name: 'numberValue',
								displayOptions: {
									show: {
										type: ['number', 'integer'],
									},
								},
								type: 'number',
								default: 0,
							},
							{
								displayName: 'String',
								name: 'stringValue',
								type: 'string',
								displayOptions: {
									show: {
										type: ['string'],
									},
								},
								default: '',
							},
						],
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async getModelVersions(
				this: ILoadOptionsFunctions,
				filter: string = '',
			): Promise<INodeListSearchResult> {
				const returnData: INodeListSearchItems[] = [];
				const modelName = this.getCurrentNodeParameter('modelName', {
					extractValue: true,
				}) as string;

				const { results } = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'replicateApi',
					{
						method: 'GET',
						url: `https://api.replicate.com/v1/models/${modelName}/versions`,
					},
				);
				// sort results by created_at (newest first)
				results.sort((a: any, b: any) => {
					return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
				});
				for (const result of results) {
					if (result.id.includes(filter))
						returnData.push({
							name: result.id,
							value: result.id,
							url: `https://replicate.com/${modelName}/versions/${result.id}`,
						});
				}
				return {
					results: returnData,
				};
			},
		},
		loadOptions: {
			async getModelProperties(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const modelName = this.getCurrentNodeParameter('modelName', {
					extractValue: true,
				}) as string;
				const modelVersion = this.getCurrentNodeParameter('modelVersion', {
					extractValue: true,
				}) as string;

				const { openapi_schema } = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'replicateApi',
					{
						method: 'GET',
						url: `https://api.replicate.com/v1/models/${modelName}/versions/${modelVersion}`,
					},
				);
				const inputs: ReplicateProperties =
					openapi_schema?.components?.schemas?.Input?.properties ?? {};
				console.log('Replicate Inputs: ' + JSON.stringify(inputs));

				for (const [key, value] of Object.entries(inputs)) {
					const type = ['integer', 'number'].includes(value.type)
						? 'number'
						: ['boolean'].includes(value.type)
						? 'boolean'
						: 'string';

					returnData.push({
						name: value.title,
						value: `${key}|${type}`,
						description: value.description,
					});
				}

				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Handle data coming from previous nodes
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let responseData;

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		if (resource === 'model') {
			if (operation === 'prediction') {
				for (let i = 0; i < items.length; i++) {
					//const modelName = this.getNodeParameter('modelName', i) as string;
					const modelVersion = this.getNodeParameter('modelVersion', i, '', {
						extractValue: true,
					}) as string;
					const properties = this.getNodeParameter(
						'properties.propertyValues',
						i,
						[],
					) as IDataObject[];

					const body = {
						version: modelVersion,
						input: mapProperties(properties),
					};

					const res = await this.helpers.httpRequestWithAuthentication.call(this, 'replicateApi', {
						method: 'POST',
						url: `https://api.replicate.com/v1/predictions`,
						encoding: 'json',
						json: true,
						body,
					});

					const getUrl = res.urls?.get;
					if (!getUrl)
						throw new NodeApiError(this.getNode(), {
							message: 'No get url found in response',
							res,
						});

					let numErrors = 0;

					while (true) {
						await new Promise((resolve) => setTimeout(resolve, 5000));

						try {
							responseData = await this.helpers.httpRequestWithAuthentication.call(
								this,
								'replicateApi',
								{
									method: 'GET',
									url: getUrl,
								},
							);
						} catch (e) {
							numErrors++;
							if (numErrors > 2) {
								throw new NodeApiError(this.getNode(), {
									message: 'Error getting data from replicate',
									res: e
								});
							}
							await new Promise((resolve) => setTimeout(resolve, 10000));
						}

						if (responseData.status === 'failed') {
							throw new NodeApiError(this.getNode(), {
								message: 'Prediction failed',
								res: responseData,
							});
						} else if (responseData.status === 'succeeded') {
							break;
						}
					}

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as IDataObject),
						{ itemData: { item: i } },
					);
					returnData.push(...executionData);
				}
			}
		}

		return [returnData];
	}
}

function mapProperties(properties: IDataObject[]) {
	return properties
		.filter(
			(property): property is Record<string, { key: string; [k: string]: any }> =>
				typeof property.key === 'string',
		)
		.map((prop) => {
			const type = prop.key.split('|')[1];
			const value = prop[`${type}Value`] ?? '';
			return [prop.key.split('|')[0], value];
		})
		.reduce(
			(obj, [key, value]) =>
				Object.assign(obj, {
					[key]: value,
				}),
			{},
		);
}
