import { Response } from 'express';
import { IApiResponse } from '../interfaces/IResponse';

export class ResponseUtils {
  /**
   * Sends a standardized successful JSON response.
   */
  public static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200,
  ): Response {
    const payload: IApiResponse<T> = {
      success: true,
      data,
      message,
    };
    return res.status(statusCode).json(payload);
  }

  /**
   * Sends a standardized error JSON response.
   */
  public static error(
    res: Response,
    message: string,
    statusCode: number = 400,
    code: string = 'BAD_REQUEST',
    details?: unknown,
  ): Response {
    const payload: IApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };
    return res.status(statusCode).json(payload);
  }
}
