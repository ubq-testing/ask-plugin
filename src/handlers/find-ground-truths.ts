import OpenAI from "openai";
import { Context } from "../types";
import { logger } from "../helpers/errors";

const FIND_GROUND_TRUTHS_SYSTEM_MESSAGE = `Using the input provided, your goal is to produce an array of strings that represent "Ground Truths."
    These ground truths are high-level abstractions that encapsulate the key aspects of the task.
    They serve to guide and inform our code review model's interpretation of the task by providing clear, concise, and explicit insights.
    
    Each ground truth should:
    - Be succinct and easy to understand.
    - Directly pertain to the task at hand.
    - Focus on essential requirements, behaviors, or assumptions involved in the task.

    Example:
    Task: Implement a function that adds two numbers.
    Ground Truths:
    - The function should accept two numerical inputs.
    - The function should return the sum of the two inputs.
    - Inputs must be validated to ensure they are numbers.
    
    Based on the given task, generate similar ground truths adhering to a maximum of 10.
    
    Return a JSON parsable array of strings representing the ground truths, without comment or directive.`;

function validateGroundTruths(truthsString: string): string[] {
  let truths;
  try {
    truths = JSON.parse(truthsString);
  } catch (err) {
    throw logger.error("Failed to parse ground truths");
  }
  if (!Array.isArray(truths)) {
    throw logger.error("Ground truths must be an array");
  }

  if (truths.length > 10) {
    throw logger.error("Ground truths must not exceed 10");
  }

  truths.forEach((truth: string) => {
    if (typeof truth !== "string") {
      throw logger.error("Each ground truth must be a string");
    }
  });

  return truths;
}

export async function findGroundTruths(context: Context, groundTruthSource: string) {
  const {
    env: { OPENAI_API_KEY },
    config: { openAiBaseUrl, model },
  } = context;

  const openAi = new OpenAI({
    apiKey: OPENAI_API_KEY,
    ...(openAiBaseUrl && { baseURL: openAiBaseUrl }),
  });

  const res = await openAi.chat.completions.create({
    messages: [
      {
        role: "system",
        content: FIND_GROUND_TRUTHS_SYSTEM_MESSAGE,
      },
      {
        role: "user",
        content: groundTruthSource,
      },
    ],
    /**
     * I've used the config model here but in my opinion,
     * we should optimize this for a quicker response which
     * means no advanced reasoning models. rfc
     */
    model: model,
  });

  const output = res.choices[0].message.content;

  if (!output) {
    throw logger.error("Failed to produce a ground truths response");
  }

  return validateGroundTruths(output);
}
