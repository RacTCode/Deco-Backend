import { prisma } from "../lib/prisma.js"

export const createQuestion = async (req, res) => {
  try {

    const { roundId, text, options, answer, link, reward } = req.body

    if (!text) {
      return res.status(400).json({
        status: false,
        message: "Question text is required"
      })
    }

    const question = await prisma.question.create({
      data: {
        roundId: Number(roundId),
        text: text,
        options: options ?? null,
        answer: answer,
        link: link ?? null,
        reward: reward
      }
    })

    res.status(201).json({
      status: true,
      data: question
    })

  } catch (err) {
    res.status(500).json({ status: false, message: err.message })
  }
}


export const getQuestionsByRound = async (req, res) => {
  try {

    const { roundId } = req.params;
    const questions = await prisma.question.findMany({
      where: {
        roundId: Number(roundId)
      },
      select: {
        id: true,
        roundId: true,
        text: true,
        options: true,
        link: true,
        reward: true
      }
    })

    res.json({
      status: true,
      data: questions
    })

  } catch (err) {
    res.status(500).json({ status: false, message: err.message })
  }
}


export const updateQuestion = async (req, res) => {
  try {

    const { id } = req.params
    const { text, options, answer, link, reward } = req.body

    const question = await prisma.question.update({
      where: {
        id: Number(id)
      },
      data: {
        text,
        options,
        answer,
        link,
        reward
      }
    })

    res.json({
      status: true,
      data: question
    })

  } catch (err) {
    res.status(500).json({ status: false, message: err.message })
  }
}


export const deleteQuestion = async (req, res) => {
  try {

    const { id } = req.params

    await prisma.question.delete({
      where: {
        id: Number(id)
      }
    })

    res.json({
      status: true,
      message: "Question deleted"
    })

  } catch (err) {
    res.status(500).json({ status: false, message: err.message })
  }
}