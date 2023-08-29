"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";


interface Params {
  text: string;
  author: string;
  communityId: null;
  //   communityId: string;
  path: string;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDB();

    const createThread = await Thread.create({
      text,
      author,
      community: null,
    });

    //update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createThread._id },
    });

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Error creating thread ${error.message}`);
  }
}

//fetching threads from database
export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();

  //calculate the no of posts to skip
  const skipAmount = (pageNumber - 1) * pageSize;

  //fetch the post that have no parents(top level threads)
  const postsQuery = Thread.find({
    parentId: { $in: [null, undefined] },
  })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User })
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
        select: "_id name parentId image",
      },
    });

  const totalPostCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });

  const posts = await postsQuery.exec();

  const isNext = totalPostCount > skipAmount * posts.length;

  return { posts, isNext };
}

export async function fetchThreadById(id: string) {
  connectToDB();

  try {
    //TOO populate community
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: User,
            select: "_id id name parentId image",
          },
          {
            path: "children",
            model: Thread,
            populate: {
              path: "author",
              model: User,
              select: "_id id name parentId image",
            },
          },
        ],
      })
      .exec();
    return thread;
  } catch (error: any) {
    throw new Error(`Error fetching thread: ${error.message}`);
  }
}

export async function addCommentToThread(
  threadId: string,
  commentText: string,
  userId: string,
  path: string
) {
  connectToDB()

  try {
    
    //Adding a comment
    //for that find the original thread by its Id 
    const originalThread = await Thread.findById(threadId)

    if(!originalThread){
      throw new Error("Thread not found")
    }

    //create new thread with the comment text
    const commentThread =new Thread({
      text:commentText,
      author:userId,
      parentId:threadId
    })

    //save the new thread
    const savedCommentThread = await commentThread.save()

    //update the original thread to include the new comment
    originalThread.children.push(savedCommentThread._id)

    //save the original thread
    await originalThread.save()

    revalidatePath(path)
    
  } catch (error:any) {
    throw new Error(`Error adding comment to thread: ${error.message}`)
  }
}
